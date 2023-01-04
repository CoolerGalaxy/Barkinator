#!/bin/bash

sudo apt update && sudo apt upgrade -y
sudo apt install python3-pip -y
sudo apt install python3-pigpio -y

pip install -r ./Barkinator/server/requirements.txt


#####crontab -l ; echo "@reboot ~/barkinator/bark.py" | crontab -
cp ./Barkinator/server/bark.service /lib/systemd/system/bark.service
cp ./Barkinator/server/helper.sh /


systemctl daemon-reload
systemctl enable pigpiod
systemctl enable bark.service
