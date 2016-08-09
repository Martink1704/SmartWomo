/* global measureIndex */
// Author: Kai-Uwe Pielka
//  - Initial Version: September, 2015 - this was for Arduino but never went into production
//  - First Rasperry Version: September, 2015 - this is the first version after decision to move smart WoMo to Rasperry platform
//  - Version of February, 2016: supports battery measurement and music

// file system api ...
var fs = require('fs');

var http = require('http');

// enable to execute shell commands ...
var sys = require('sys')
var exec = require('child_process').exec;

// create MCP3008 Api if spi device is available ...
var Mcp3008 = require('./mcp3008.js');
var adc;
fs.exists("/dev/spidev0.0", function(exists) {
    if (exists) {
        adc = new Mcp3008();
        console.log('spi device found');
    } else {
        adc = new Mcp3008();
        console.log('spi device NOT found');
    }
});

// read configuration data from file ...
var configuration = JSON.parse(fs.readFileSync('smartWoMo.configuration', 'utf8'));
var configurationChanged = false;

// write configuration data to file ...
function saveConfiguration() {
    if (configurationChanged) fs.writeFile("smartWoMo.configuration", JSON.stringify(configuration));
    configurationChanged = false;
}

// smartWoMoValues carries all state values
// state values are generated dynamically after provided by Arduino or User Interface
smartWoMoValues = new Object();
// initialize values ...
if (configuration.targetTemperature) {
    smartWoMoValues.targetTemperature = configuration.targetTemperature;
} else {
    smartWoMoValues.targetTemperature = 21;
}
smartWoMoValues.temperature = -999;
smartWoMoValues.humidity = -999;
smartWoMoValues.heatingIsOn = false;
smartWoMoValues.heatingSwitchIsOn = false;  // To Do: diesen Schalter in server.js und index.html unterstützen
smartWoMoValues.batteryVoltage = 0;
smartWoMoValues.batteryLevel = 0;
smartWoMoValues.temp = 0;
smartWoMoValues.musicPlayLists = [];
smartWoMoValues.radioStreams = [];
// smooth out fluctuating measurements from MCP3008
synchronizedValue = [342];
voltageMeasurePoint = [342, 342, 342, 342, 342, 342, 342, 342, 342, 342, 342, 342, 342, 342, 342, 342, 342, 342, 342, 342];
voltageMeasureIndex = 0;
currentBatteryChatStatus = " +++";

// initialize GPIO's ...
exec("gpio mode 0 out && gpio write 0 0", function(error, stdout, stderr) {
    if (error == null) {
        console.log("GPIO 0 (Heizungsrelais) initialisiert");
    }
});

// determine music playlists and tracks ...
// var musicDirectory = '/home/pi/smartwomo/node/public/music';
var musicDirectory = '/Users/d002671/Documents/RasperrySW/node/public/music';

fs.open(musicDirectory, 'r', function(err, fd) {
    if (err && err.code == 'ENOENT') {
        console.log('music folder NOT found');
    } else {
        console.log('music folder found');
        var results = [];
        fs.readdirSync(musicDirectory).forEach(function(file) {
            var musicPlaylistPath = musicDirectory + '/' + file;
            var stat = fs.statSync(musicPlaylistPath);
            if (stat && stat.isDirectory()) {
                // console.log("Playlist: " + musicPlaylistPath);
                var playLists = musicPlaylistPath.split("/");
                var playListName = playLists[playLists.length - 1];
                // console.log(playListName);
                var playList = new Object();
                playList.name = playListName;
                playList.track = [];
                fs.readdirSync(musicPlaylistPath).forEach(function(tfile) {
                    var tstat = fs.statSync(musicPlaylistPath + "/" + tfile);
                    if (tstat && !tstat.isDirectory() && tfile.substring(0, 1) != ".") {
                        playList.track.push(tfile);
                        // console.log("Track: " + tfile);
                    } else {
                        console.log("Directories in music playlist directories are simply ignored.");
                    }
                });
                smartWoMoValues["musicPlayLists"].push(playList);
            } else {
                var radioStreamsFile = musicDirectory + '/' + file;
                if (file == "smartWoMoRadioSender") {
                    console.log("Radiosender gefunden");
                    fs.readFileSync(radioStreamsFile).toString().split(/\r?\n/).forEach(function(radioStream) {
                        var words = radioStream.split(",");
                        if (words[1]) {
                            console.log(radioStream);
                            // console.log("Sender: " + words[0]);
                            // console.log("Url: " + words[1]);
                            var radioStation = new Object();
                            radioStation.label = words[0];
                            radioStation.url = words[1];
                            urlParts = radioStation.url.split('.');
                            if (urlParts[urlParts.length - 1] == "m3u") {
                                // replace playlist by real Url because some browsers can't handle playlists in Audio Tag
                                var request = http.get(radioStation.url, function(res) {
                                    // console.log("### in http get " + radioStation.url);
                                    res.setEncoding('utf8');
                                    res.on('data', function(chunk) {
                                        console.log("--> Playlist " + radioStation.url + " heruntergeladen");
                                        chunk.split(/\r?\n/).forEach(function(line) {
                                            if (line.lastIndexOf("http://", 0) === 0) {
                                                radioStation.url = line;
                                                console.log("----> Url: " + line);
                                            }
                                        });
                                    });

                                });
                                request.on('error', function(err) {
                                    console.log("-----> Fehler beim Auflösen der Playlist");
                                });
                                request.setTimeout(5000, function() {
                                    console.log("-----> Die Playlist kann nicht aufgelöst werden");
                                    radioStation.url = "";
                                    request.end();
                                });
                            }
                            if (radioStation.url != "") {
                                smartWoMoValues.radioStreams.push(radioStation);
                            }
                        }
                    });
                } else {
                    console.log("Files in music folder are simply ignored.");
                }
            }
        });
    }
});

// connect to XMPP server

var JabberClient = require('node-xmpp-client');
var jabberClient;

if (configuration.useChat == "true" && configuration.jabberService != "") {
    // JabberClient = new JabberClient({
    jabberClient = new JabberClient({
        jid: configuration.jabberUser,
        password: configuration.jabberPassword,
        host: configuration.jabberService,
        reconnect: true
    });

    jabberClient.connection.socket.on('error', function(error) {
        console.error(error);
        process.exit(1);
    });

    jabberClient.on('online', function() {
        console.log(new Date().toString() + ' online');
        updateChatStatus();
    });

    jabberClient.on('stanza', function(stanza) {
        if (stanza.is('message') &&
            // Important: never reply to errors!
            (stanza.attrs.type !== 'error')) {
            // Swap addresses...
            stanza.attrs.to = stanza.attrs.from
            delete stanza.attrs.from
            processChatMessage(stanza.getChildText('body'));
        }
    });

}

// set chat status ...
function updateChatStatus() {
    var chatStatus = smartWoMoValues.temperature.toString() + "°";
    if (smartWoMoValues.humidity > -999) {
        chatStatus += "  " + smartWoMoValues.humidity.toString() + "%";
    }
    if (smartWoMoValues.targetTemperature > -999) {
        chatStatus += "  (" + smartWoMoValues.targetTemperature.toString() + "°)";
    }
    if (smartWoMoValues.heatingIsOn) {
        chatStatus += "  *";
    }
    chatStatus += currentBatteryChatStatus;
    if (jabberClient) {
        jabberClient.send(new JabberClient.Stanza('presence', {})
            .c('show').t('chat').up()
            .c('status').t(chatStatus)
        );
    }
}

var timestampOfLastBatteryWarning = 0;
function setCurrentBatteryChatStatus() {
    // currentBatteryChatStatus
    var cs = " ";
    if (smartWoMoValues.batteryLevel <= 0) {
        cs += " Batterie!";
    } else {
        if (smartWoMoValues.batteryLevel > 100 && smartWoMoValues.batteryLevel < 150) {
            cs += " +++++";
        } else {
            if (smartWoMoValues.batteryLevel >= 150) {
                cs += ">>>>>";
            } else {
                var numberOfPlus = Math.floor((smartWoMoValues.batteryLevel + 19) / 20);
                for (var i = 1; i <= 5; i++) {
                    cs += (i <= numberOfPlus) ? "+" : " ";
                }
            }
        }
    }
    if (cs != currentBatteryChatStatus) {
        currentBatteryChatStatus = cs;
        updateChatStatus();
        if (smartWoMoValues.batteryLevel <= 0) {
            if (Math.abs(Date.now() - timestampOfLastBatteryWarning) > 3600000) {
                // send warning only once an hour ...
                timestampOfLastBatteryWarning = Date.now();
                sendChatMessage("WARNUNG: Die Aufbaubatterie ist leer !");
            }
        }
    }
}

// send message to chat receiver
function sendChatMessage(message) {
    if (jabberClient) {
        var stanza = new JabberClient.Stanza(
            'message',
            { to: configuration.myJabberUser, type: 'chat' }
        ).c('body').t(message);
        jabberClient.send(stanza);
    }
}

// receive and process data from User Interface ...
var express = require('express');
var server = express();

// handler for static files ...
server.use(express.static(__dirname + '/public'));

// handler for providing all known values ...
server.get('/get', function(req, res) {
    var response = "";
    response = JSON.stringify(smartWoMoValues);
    res.end(response);
})

// handler for changing values ...
server.get('/set', function(req, res) {
    for (var property in req.query) {
        var changedProperties = "";
        if (req.query.hasOwnProperty(property)) {
            changedProperties += property + "=" + req.query[property] + String.fromCharCode(10);
            // add variable to message for Arduino ...
            smartWoMoValues[property] = req.query[property];
        }
        // react on change ...
        if (property == "targetTemperature") {
            configuration.targetTemperature = req.query[property];
            configurationChanged = true;
            updateChatStatus();
        }
    }
    res.end("Data received !");
})
server.get('/angular', function (req, res) {
  res.sendFile(__dirname + '/public/angular.html');
});
// handler for chat messages ...
function processChatMessage(chatMessage) {
    if (chatMessage) {
        var words = chatMessage.split(" ");
        // console.log("<###### Chat Kommando: " + chatMessage + "#######>");
        if (words && words.length > 0) {
            var chatCommand = words[0].toLowerCase();
            if (chatCommand == "t" && words.length > 1 && (words[1].match(/^[0-9]+$/) != null)) {
                smartWoMoValues.targetTemperature = parseInt(words[1]);
                // addChangedVariableToEventQueue("targetTemperature");
                sendChatMessage("Neue Wunschtemperatur: " + words[1] + "°");
                configuration.targetTemperature = smartWoMoValues.targetTemperature;
                configurationChanged = true;
                updateChatStatus();
            } else {
                if (chatCommand == "i") {
                    var msg = "Aktuelle Temperatur: " + smartWoMoValues.temperature + "°";
                    if (smartWoMoValues.humidity > -999) {
                        msg += "\nLuftfeuchtigkeit: " + smartWoMoValues.humidity.toString() + "%";
                    }
                    if (smartWoMoValues.targetTemperature > -999) {
                        msg += "\nWunschtemperatur: " + smartWoMoValues.targetTemperature.toString() + "°";
                    }
                    if (smartWoMoValues.heatingIsOn) {
                        msg += "\nDas Wohnmobil wird gerade aufgeheizt.";
                    } else {
                        // msg += "\nDie Heizung ist inaktiv.";
                    }
                    if (smartWoMoValues.batteryLevel >= 150) {
                        msg += "\nDie Batterie wird gerade geladen.";
                    } else {
                        if (smartWoMoValues.batteryLevel <= 0) {
                            msg += "\nDie Batterie ist leer !";
                        } else {
                            if (smartWoMoValues.batteryLevel > 100 && smartWoMoValues.batteryLevel < 150) {
                                msg += "\nDie Batterie ist voll.";
                            } else {
                                // msg += "\nDie Batterie ist zu " + smartWoMoValues["batteryLevel"] + "% gefüllt";
                            }
                        }
                    }
                    msg += "\nDie Batteriespannung beträgt " + smartWoMoValues.batteryVoltage + " Volt.";
                    sendChatMessage(msg);
                } else {
                    if (chatCommand == "ip") {
                        detectIPAddress();
                    } else {
                        msg = "Gebe eines der folgenden Kommandos ein (ohne die Anführungszeichen):";
                        msg += '\n\n"t 24", um die Wunschtemperatur auf 24° zu setzen. Du kannst natürlich auch eine andere Temperatur wählen.';
                        msg += '\n\n"i", um die aktuellen Infos zu erhalten.';
                        msg += '\n\n"ip", um die internen IP Adressen des Raspberry zu ermitteln.';
                        msg += '\n\nDie Kommandos dürfen auch groß geschrieben sein - also zum Beispiel "T 24" statt "t 24".';
                        sendChatMessage(msg);
                    }
                }
            }
        }
    }
}

function detectIPAddress() {
    var ips = "";
    exec("ifconfig", function(error, stdout, stderr) {
        if (error == null) {
            // console.log("IP Adresse ermitteln ...");
            var sentences = stdout.split("\n");
            for (var sentence of sentences) {
                // console.log("Sentence: " + sentence);
                if (sentence.indexOf("inet") > -1) {
                    var words = sentence.split(":");
                    // console.log("words[1]: " + words[1]);
                    var inet = words[1].split(" ");
                    // console.log("inet[0]: " + inet[0]);
                    if (inet[0].indexOf("127.0.0.1") == -1) {
                        ips += inet[0] + "/";
                    }
                    // console.log("ips: " + ips);
                }
            }
        }
        // console.log("ips: " + ips);
        sendChatMessage("Interne IP Adresse(n): " + ips);
    });
}

// smartWoMoController is checking for changes of sensors and acts on them
// it also reacts on values that were changed by a user (e.g. changes of the target temperature of the heating)
var timestampOfLastTemperatureDetection = 0;
function smartWoMoController() {

    // detect current temperature and humuidity (but only every 3 seconds because of slow reaction of temperature sensor)...
    if (Math.abs(Date.now() - timestampOfLastTemperatureDetection) > 5000) {
        timestampOfLastTemperatureDetection = Date.now();
        // detect battery voltage ...
        getCurrentBatteryVoltage("LeadAcid");
        setCurrentBatteryChatStatus();
        // console.log("Temperaturermittlung");
        // exec("cat temperatureSensorOutput", function (error, stdout, stderr) {
        exec("loldht 7", function(error, stdout, stderr) {
            if (error == null) {
                var sentences = stdout.split("\n");
                if (stdout.indexOf("Data not good") == -1) {
                    // Temperature and Humidity could be detected ...
                    for (var sentence of sentences) {
                        if (sentence.indexOf("Humidity") != -1) {
                            var words = sentence.split(" ");
                            var xyz = parseFloat(words[2]);
                            var abc = Math.round(xyz).toString();
                            if (abc != smartWoMoValues.humidity) {
                                smartWoMoValues.humidity = abc;
                                // addChangedVariableToEventQueue("humidity");
                                updateChatStatus();
                            }
                            xyz = parseFloat(words[6]);
                            abc = Math.round(xyz).toString();
                            if (abc != smartWoMoValues.temperature) {
                                smartWoMoValues.temperature = abc;
                                // addChangedVariableToEventQueue("temperature");
                                updateChatStatus();
                            }
                        }
                    }
                }
            }
        });
        // write configuration to file if it was changed ...
        saveConfiguration();
    }

    // if controller was able to detect the current temperature, check whether heating has to be switched ...
    // To Do: verify time period since last temperature detection; if it is too long ago, switch off heating ?
    if (smartWoMoValues.temperature > -999) {

        // temperature was detected; check whether to switch heating on ...
        if ((smartWoMoValues.targetTemperature - smartWoMoValues.temperature) >= 1) {
            // current temperature is more than 1 degree lower than target temperature, so switch heating on ...
            switchHeatingOn();
        }
        // check whether heating has to be switched off ...
        if ((smartWoMoValues.temperature - smartWoMoValues.targetTemperature) >= 1) {
            // current temperature is more than 2 degree higher than target temperature, so switch heating off ...
            switchHeatingOff();
        }


    }

}

// controller functions ...

function getCurrentBatteryVoltage(batteryType) {

    if (batteryType === "LeadAcid") {
        // IMPORTANT: this calculation does not work fo other battery types !!!
        // prepare general parameters for Lead Acid Batteries (german: Blei Säure Batterien)
        var voltageDivider = 1 / 11; // voltage Divider consists of one 10 kOhm resistor and one 1 kOhm resistor

        // MCP3008 does not provide temperature in degrees but in a corresponding value; so, we have to convert the voltages ...
        var voltagePerBit = 3.3 / 1024; // reference Voltage is 3.3 Volt; MCP3008 resolution is 1024 bit

        // Now we must read the current value from MCP3008 ...
        if (adc) { // this is performed asynchronously !
            // read current voltage from channel 0 of MCP3008 ...
            adc.read(0, function(value) {
                synchronizedValue[0] = value;
            });
        }
        voltageMeasureIndex = (++voltageMeasureIndex > 19) ? 0 : voltageMeasureIndex;
        voltageMeasurePoint[voltageMeasureIndex] = synchronizedValue[0];
        var accumulatedBatteryVoltageInBits = 0;
        for (var i = 0; i < 20; i++) {
            accumulatedBatteryVoltageInBits += voltageMeasurePoint[i];
        }
        var batteryVoltageInBits = accumulatedBatteryVoltageInBits.toFixed(11) / 20;
        smartWoMoValues.batteryVoltage = (batteryVoltageInBits * voltagePerBit / voltageDivider).toFixed(1);
        var batteryPercentage = ((batteryVoltageInBits.toFixed(1) - 332.0) / (353.0 - 332.0)) * 100;
        // #####
        // calculate deviation forced by temperature differences
        var deviationInPercent = 0.0;
        percentDeviationPerDegree = 6.0;
        if (smartWoMoValues.temperature > -100 && smartWoMoValues.temperature < 100) {
            // calculate deviation ...
            deviationInPercent = (20 - smartWoMoValues.temperature) * percentDeviationPerDegree * voltageDivider;
        }
        batteryPercentage = batteryPercentage + Math.round(deviationInPercent);
        // #####
        if (batteryPercentage > 100 && batteryPercentage < 150) {
            smartWoMoValues.batteryLevel = 100;
        } else {
            smartWoMoValues.batteryLevel = Math.round(batteryPercentage);
        }
    } else {
        smartWoMoValues.batteryLevel = 0; // if battery type is unknown use 0 Volt
    }
}

function switchHeatingOn() {
    if (!smartWoMoValues.heatingIsOn) {
        exec("gpio write 0 0", function(error, stdout, stderr) {
            if (error == null) {
                smartWoMoValues.heatingIsOn = true;
                updateChatStatus();
            }
        });
    }
}
function switchHeatingOff() {
    if (smartWoMoValues.heatingIsOn) {
        exec("gpio write 0 1", function(error, stdout, stderr) {
            if (error == null) {
                smartWoMoValues.heatingIsOn = false;
                updateChatStatus();
            }
        });
    }
}

// run smartWoMo controller on a regular base ...
setInterval(function() {
    smartWoMoController();
}, 500);

var port = 1111;
server.listen(port, function() {
    console.log('server listening on port ' + port);
});
