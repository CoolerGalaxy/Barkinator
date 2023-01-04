var b = []
var s = []

$(document).ready(function(){
    // var host = window.location.host
    var polling_rate = 5000
    var data = []
    var historyChart = null
    var soundChart = null

    $.ajax({
        type: "GET",
        url: "/init",
        dataType: "json",
        async: false, // get all data before proceeding
        success: function(res) {
            data = res
            console.log('initial update')
        },
        error: function(r,s,e) { 
            console.log(r,s,e)
            alert(e)
        }
    })
	
	$("#button").click(function(e) {
		$.ajax({
			type: "POST",
			url: "/button",
            dataType: "json",
			data: { instruction: "go (doesn't matter)" },
			success: function(res) { 
                add_data(res)
                historyChart.update()

                get_sine(res[res.length-1])
                update_sound_chart(soundChart)

                console.log('server got button press')
            },
			error: function(r,s,e) { 
                console.log(r,s,e)
                alert(e)
            }
		})
	})

    function poll() {
        setTimeout(function() {
            $.ajax({
                type: "GET",
                url: "/update",
                dataType: "json",
                async: true,
                success: function(res) { 
                    add_data(res)
                    historyChart.update()

                    if (res.length > 0) {
                        get_sine(res[res.length-1])
                        update_sound_chart(soundChart)
                        console.log('updated data received')
                    }
                },
                error: function(r,s,e) { 
                    //console.log(e) // investigate regular timeouts
                },
                complete: poll,
                timeout: 5000
            })
        }, polling_rate)
    }

    // day calculation
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
    const currentTime = new Date()
    var currentDay = currentTime.getDay()

    b = build_history(data)
    s = get_sine(data[data.length-1])

    /*  blue: 000070
        green: 007000
        yellow: 707000
        orange: 703500
        red: 700000 */

    historyChart = new Chart(
        $('#historyChart')[0], {

        type: 'bar',
        data: {
          labels: [ days[(currentDay+7-6)%7], 
                    days[(currentDay+7-5)%7],
                    days[(currentDay+7-4)%7],
                    days[(currentDay+7-3)%7],
                    days[(currentDay+7-2)%7],
                    days[(currentDay+7-1)%7],
                    'Today'],
          datasets: [
            {
                label: 'Low',
                data: b[0],
                backgroundColor: '#000050',
            },
            {
                label: 'Mid-low',
                data: b[1],
                backgroundColor: '#005000',
            },
            {
                label: 'Moderate',
                data: b[2],
                backgroundColor: '#505000',
            },
            {
                label: 'Mid-high',
                data: b[3],
                backgroundColor: '#502500',
            },
            {
                label: 'High',
                data: b[4],
                backgroundColor: '#500000',
            },
            {
                label: 'Extreme',
                data: b[5],
                backgroundColor: '#770000',
            },
          ]
        },
        options: {
            scales: {
                xAxes: [{ 
                    stacked: true,
                    gridLines: {
                        display: false,  
                        zeroLineColor: '#fff'                    
                    },
                    ticks: {
                        color: '#fff',
                        fontColor: "#fff",
                        beginAtZero: true
                    }
                }],
                yAxes: [{ 
                    stacked: true,
                    display: true,
                    scaleLabel: {
                        display: true,
                        fontColor: '#fff',
                        labelString: 'Number of Activations'
                    },
                    gridLines: {
                        color: '#fff',
                        zeroLineColor: '#fff'
                    },
                    ticks: {
                        color: '#fff',
                        fontColor: "#fff",
                        beginAtZero: true
                    }
                }]
            },
            legend: {
                position: 'bottom',
                labels: {
                    fontColor: '#fff'
                }
            }
        }

    })

    soundChart = new Chart(
        $('#soundChart')[0], {

        type: 'scatter',
        data: {
          datasets: [
            {
              data: s,
              borderColor: '#a00',
              fill: false,
              lineTension: 0
            },
          ],
        },
        options: {
            legend: false,
            maintainAspectRatio: false,
            elements: {
                point: {
                    radius: 0
                }
            },
            scales: {
                xAxes: [
                    {
                        scaleLabel: {
                            display: true,
                            fontColor: '#fff',
                            labelString: 'Run Time (Seconds)',
                        },
                        gridLines: {
                            color: '#fff',
                            zeroLineColor: '#fff'
                        },
                        ticks: {
                            color: '#fff',
                            fontColor: "#fff",
                            beginAtZero: true,
                            stepSize: 1,
                            suggestedMax: 6,
                        },
                        type: 'linear',
                        position: 'bottom',
                    },
                ],
                yAxes: [
                    {
                        scaleLabel: {
                            display: true,
                            fontColor: '#fff',
                            labelString: 'Frequency (Hz)'
                        },
                        gridLines: {
                            color: '#fff',
                            zeroLineColor: '#fff'
                        },
                        ticks: {
                            color: '#fff',
                            fontColor: "#fff",
                            min: 5000, //min: 15000,
                            max: 25000,
                            stepSize: 1000
                        }
                    },
                ]
            },
        },

    })
    poll()
})

function get_sine(entry) {
    //var time = parseInt(entry[0])
    //var temp = parseInt(entry[1])
    //var excitation = parseInt(entry[2])
    var loops = parseInt(entry[3])
    var base_freq = parseInt(entry[4])
    var amplitude = parseInt(entry[5])
    //var samples = parseInt(entry[6])
    var run_time = parseFloat(entry[7])
    const wave = [];

    /*for (let x = 0; x <= 2 * Math.PI; x += 0.01) { 
        wave.push({ x: x*(run_time/6.2), y: base_freq + amplitude * Math.cos(frequency * x) });
    }*/

    var period_time = run_time / loops
    var t = 0

    wave.push({ x: t, y: base_freq+amplitude })

    for (var l=0; l<loops; l++) {
        for (var i of [-1,1]) {
            t += period_time/2
            wave.push({ x: t, y: base_freq+amplitude*i })
        }
    }

    s=wave
    return wave;
}

function update_sound_chart(chart) {
    chart.data.datasets[0].data = s
    chart.update()
}

function add_data(new_data) {
    const oneDayInMs = 1000 * 60 * 60 * 24
    var t = new Date()
    var pm = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0,0,0)
    var nextMidnight = pm.getTime() + oneDayInMs

    for (var i=0; i<new_data.length; i++) {
        var days_ago = Math.floor( (nextMidnight - new_data[i][0]) / oneDayInMs )
        b[new_data[i][2]][(7+6-days_ago)%7] += 1
    }
}

// builds 2d array with each descending day and ascending excitation value
function build_history(data, daysAgo, excitation) {
    // build zeroed array of correct dimension
    var ans = []
    for (var i=0; i<6; i++) {
        var exc = []
        for (var j=0; j<7; j++) {
            exc.push(0)
        }
        ans.push(exc)
    }

    const oneDayInMs = 1000 * 60 * 60 * 24
    var t = new Date()
    var pm = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0,0,0)
    var nextMidnight = pm.getTime() + oneDayInMs

    // add a bark count for each entry
    for (var i=0; i<data.length; i++) {
        if (data[i][0] > nextMidnight-7*oneDayInMs) { // chart timeframe is one week --- is 7 correct?
            var days_ago = Math.floor( (nextMidnight - data[i][0]) / oneDayInMs )
            ans[data[i][2]][(7+6-days_ago)%7] += 1
        }
    }
    return ans
}