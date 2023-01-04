import RPi.GPIO as GPIO
import signal
import os
import sys
import time
import random
import pigpio

from datetime import datetime as dt
from datetime import time as dt_time
from datetime import timedelta as dt_timedelta

from flask import Flask, render_template # http server
import json
import threading
from queue import Queue
import logging
from werkzeug.serving import make_server

logging.getLogger('werkzeug').disabled = True

HTTP_PORT = 7070
activationEvent = threading.Event()
dataReadyEvent = threading.Event()

updateQueue = Queue()

###################### NEED TO SETUP TO RUN ON BOOT (Cron) #################################
# https://www.makeuseof.com/how-to-run-a-raspberry-pi-program-script-at-startup/

# Server skeleton code was copied from this generous fellow...
# https://stackoverflow.com/questions/15562446/how-to-stop-flask-application-without-using-ctrl-c/45017691#45017691

class ServerThread(threading.Thread):
    def __init__(self, app):
        threading.Thread.__init__(self)
        self.server = make_server('0.0.0.0', HTTP_PORT, app)
        self.ctx = app.app_context()
        self.ctx.push()

    def run(self):
        print('starting server')
        self.server.serve_forever()

    def shutdown(self):
        self.server.shutdown()

def start_server():
    global server
    app = Flask(__name__)

    # App routes defined here
    @app.route("/")
    def main():
        return render_template('index.html')

    @app.route("/init", methods=["GET"])
    def init():
        res = []

        midnight = dt.combine(dt.today(), dt_time.min)
        lastweek_midnight = midnight - dt_timedelta(days=7) # midnight one week ago

        with open('./bark_log.txt', 'r') as f:
            for line in f.readlines():
                bk_info = line.strip('\n').split(' ')[:-1]

                if dt.fromtimestamp(float(bk_info[0])/1000) > lastweek_midnight: 
                    res.append(bk_info)
        return json.dumps(res)

    @app.route("/button", methods=["POST"])
    def button():
        activationEvent.set()
        dataReadyEvent.clear()
        dataReadyEvent.wait(10)

        res = []
        while not updateQueue.empty():
            res.append(updateQueue.get().split(' '))
        return json.dumps(res)

    @app.route("/update", methods=["GET"])
    def update():
        res = []
        while not updateQueue.empty():
            res.append(updateQueue.get().split(' '))
        return json.dumps(res)

    server = ServerThread(app)
    server.start()
    print('server started')

def stop_server():
    global server
    server.shutdown()

class Agent:
    def __init__(self):
        self.MIN_FREQ = 14000 #20000 # 20,000Hz is the max threshold for human hearing
        self.MAX_FREQ = 20000 #25000 # 60,000Hz is the max threshold for canine hearing
        self.audio_pin = 12
        self.radio_pin = 16
        self.excitation = 0
        self.excitation_timestamp = time.time() - 60 # +60 seconds

        GPIO.setmode(GPIO.BCM) #software GPIO numbering
        GPIO.setup(self.radio_pin, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)
        self.pi = pigpio.pi()
        GPIO.add_event_detect(self.radio_pin, GPIO.BOTH, callback=self.radio_callback, bouncetime=50)
        print("Listening for radio signal")

        signal.signal(signal.SIGINT, self.signal_handler)
        #signal.pause()

        while True:
            activationEvent.clear()
            activationEvent.wait()
            self.build_sound()

    def build_sound(self): 
        run_seconds = 0.1 # run time will be at least one wave period and is extended by the excitation level
        amplitude = random.randint(500, (self.MAX_FREQ-self.MIN_FREQ)/2) # remember this only accounts for half of warble range
        samples = random.randint(10, amplitude//10) # pi/2 samples (first quarter of wave period)
        base_freq = random.randint(self.MIN_FREQ+amplitude, self.MAX_FREQ-amplitude)
        step = amplitude//samples

        # force cos wave into constraints (this is sloppy)
        if base_freq + amplitude < self.MAX_FREQ and base_freq - amplitude > self.MIN_FREQ:
            freq  = base_freq + amplitude
        elif base_freq + amplitude >= self.MAX_FREQ:
            freq = self.MAX_FREQ - 1
        else:
            freq = self.MIN_FREQ + amplitude*2 + 1 # offset with cosine amplitude range

        # handle excitation level
        if time.time() - self.excitation_timestamp < 60: # increase negative reinforcement if ignored
            if self.excitation < 5:
                self.excitation += 1
        if time.time() - self.excitation_timestamp > 300: # if there has been at least 5 minutes of peace, reset excitation
            self.excitation = 0
        self.excitation_timestamp = time.time()

        # wave generation loop
        loops=0
        start_time = time.time()
        self.pi.hardware_PWM(self.audio_pin, base_freq, 500000)

        while (time.time() - start_time) < run_seconds + self.excitation:
            for i in [-1,1]:
                for _ in range(samples*2):
                    if freq > self.MIN_FREQ and freq < self.MAX_FREQ: # constrain to acceptable frequency range
                        freq = freq + (step*i)

                    self.pi.hardware_PWM(self.audio_pin, freq, 500000)

            loops += 1
            time.sleep(0.1)

        self.pi.hardware_PWM(self.audio_pin, 0, 0)

        run_time = time.time() - start_time

        print('run time:', run_time, ', loops:', loops, ', b_freq:', base_freq, ', amp:', amplitude, ', samples:', samples)
        print('Finished sound, listening again')

        self.build_log(loops, base_freq, amplitude, samples, run_time)

    def signal_handler(self, sig, frame): # allows clean exit from program
        self.pi.stop()
        GPIO.cleanup()
        sys.exit(0)

    def radio_callback(self,_):
        activationEvent.set()
        #self.build_sound()

    def build_log(self, loops, base_freq, amplitude, samples, run_time):
        cpu_temperature = os.popen("vcgencmd measure_temp") \
            .readline() \
            .replace('temp=', '') \
            .replace("'C", "") \
            .strip() #maybe refactor with regex

        dump = str(time.time()*1000) + ' ' # convert timestamp to be compatible with JS

        if len(cpu_temperature) > 0: # preserve format in case temp data not available
            dump += cpu_temperature + ' '
        else:
            dump += str(0) + ' '

        dump += str(self.excitation) + ' ' + \
                str(loops) + ' ' + \
                str(base_freq) + ' ' + \
                str(amplitude) + ' ' + \
                str(samples) + ' ' + \
                str(run_time)

        updateQueue.put(dump)
        dataReadyEvent.set()
                
        dump += ' \n'

        with open('./bark_log.txt', 'a') as f:
            f.write(dump)

if __name__ == '__main__':
    start_server()
    Agent()