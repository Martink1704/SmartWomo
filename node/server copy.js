// Author: Kai-Uwe Pielka
//  - Initial Version: September, 2015 - this was for Arduino but never went into production
//  - First Rasperry Version: September, 2015 - this is the first version after decision to move smart WoMo to Rasperry platform

// enable to execute shell commands ...
var sys = require('sys')
var exec = require('child_process').exec;

// smartWoMoValues carries all state values
// state values are generated dynamically after provided by Arduino or User Interface
smartWoMoValues = new Object();
// initialize values ...
smartWoMoValues["targetTemperature"] = 21;
smartWoMoValues["temperature"] = -999;
smartWoMoValues["humidity"] = -999;
smartWoMoValues["heatingIsOn"] = false;
smartWoMoValues["heatingSwitchIsOn"] = false;  // To Do: diesen Schalter in server.js und index.html unterstützen
smartWoMoValues["batteryVoltage"] = 0;

// initialize GPIO's ...
exec("gpio mode 0 out && gpio write 0 1", function (error, stdout, stderr) {
        if (error == null) {
			console.log("GPIO 0 (Heizungsrelais) initialisiert");
        }
});

// connect to XMPP server
var jabberId = 'JabberBenutzerMeinesWohnmobils@xyz.de'; // ersetzen gegen die Jabber/XMPP Id des Wohnmobils 
var myJabberId = 'MeinJabberBenutzer@xyz.de'; // ersetzen gegen meine Jabber/XMPP Benutzer Id
var jabberPassword = 'JabberKennwortDesWohnmobilBenutzers'; // ersetzen gegen das Kennwort des Jabber Benutzers vom Wohnmobil
var jabberHost = 'xyz.de'; // ersetzen gegen den Jabber/XMPP Server, bei dem das Wohnmobil registriert ist

var JabberClient = require('node-xmpp-client');
var jabberClient = new JabberClient({
    jid: jabberId,
    password: jabberPassword,
    host: jabberHost,
    reconnect: true
});

jabberClient.connection.socket.on('error', function(error) {
    console.error(error)
    jabberClient = new JabberClient({
        jid: jabberId,
        password: jabberPassword,
        host: jabberHost,
        reconnect: true
    });
    // process.exit(1)
});

jabberClient.on('online', function() {
    console.log('online')
    //jabberClient.send(new JabberClient.Stanza('presence', { })
    //  .c('show').t('chat').up()
    //  .c('status').t(smartWoMoValues["temperature"].toString() + "°")
    //); 
    updateChatStatus();
});

jabberClient.on('stanza', function(stanza) {
    if (stanza.is('message') &&
      // Important: never reply to errors!
      (stanza.attrs.type !== 'error')) {
        // Swap addresses...
        stanza.attrs.to = stanza.attrs.from
        delete stanza.attrs.from
        // and send back
        // console.log('Sending response: ' + stanza.root().toString())
        // jabberClient.send(stanza)
        processChatMessage(stanza.getChildText('body'));
    }
});

// set chat status ...
function updateChatStatus() {
	var chatStatus = smartWoMoValues["temperature"].toString() + "°";
	if (smartWoMoValues["humidity"] > -999) {
		chatStatus += "  " + smartWoMoValues["humidity"].toString() + "%";
	}
	if (smartWoMoValues["targetTemperature"] > -999) {
		chatStatus += "  (" + smartWoMoValues["targetTemperature"].toString() + "°)";
	}	
	if (smartWoMoValues["heatingIsOn"]) {
		chatStatus += "  *";
	} 
    jabberClient.send(new JabberClient.Stanza('presence', { })
      .c('show').t('chat').up()
      .c('status').t(chatStatus)
    );
}

// send message to chat receiver
function sendChatMessage(message) {
	var stanza = new JabberClient.Stanza(
            'message',
            { to: myJabberId, type: 'chat' }
        ).c('body').t(message);
	jabberClient.send(stanza);	
}

// lifetime of event in event queue; this is necessary to cleanup the queue after all clients should have received the event
LIFETIME_OF_EVENT = 10000; // 10000 milli seconds -> 10 seconds

// sequence number is added to events to enable clients to identify events they already have been processed
eventSequence = 0;


// management data for events
function EventManagement() {
    this.timestamp = Date.now();        // timestamp of event creation
    this.sequence = eventSequence++;    // sequence number of event    
}

// this is the representation of event for a changed variable
function VariableChangedEvent(variable) {
    this.management = new EventManagement();    // management of this event
    this.variable = variable;                   // name of variable that was changed
};

// eventQueue carries events that recently occured ... 
eventQueue = [];

function addToEventQueue(event) {
    eventQueue.push(event);
}

// removes old entries from event queue
function cleanUpEventQueue() {
    
    // count outdated queue entries ...
    var numberOfObsoleteEntries = 0;
    for (currentEvent of eventQueue) {
        if (currentEvent.management.timestamp < (Date.now() - LIFETIME_OF_EVENT)) {
            numberOfObsoleteEntries++;
        } else {
            break;
        }
    }
    
    // remove outdated entries from queue ...
    while (numberOfObsoleteEntries > 0) {
        eventQueue.shift();
        --numberOfObsoleteEntries;
    }

}

function addChangedVariableToEventQueue(variable) {
    var newEvent = new VariableChangedEvent(variable);
    addToEventQueue(newEvent);
}

// receive and process data from User Interface ...
var express = require('express');
var server = express();

// handler for static files ...
server.use(express.static(__dirname + '/public'));

// handler for providing events ...
server.get('/getEvents', function (req, res) {
	// console.log("getEvents gerufen");
    // remove old events from queue ...
    cleanUpEventQueue();
    // return events ...
    var response = "[";
    var firstEntry = true;
    for (var currentEvent of eventQueue) {
        // console.log(response);
        // response += currentEvent.management.sequence.toString() + " " + currentEvent.variable + "=" + smartWoMoValues[currentEvent.variable] + String.fromCharCode(10);
        if (firstEntry == true) {
            firstEntry = false;
        } else {
            response += ",";
        }
        response += '{"sequence":' + currentEvent.management.sequence.toString() + ',' 
                        + '"' + currentEvent.variable + '"' + ':' + '"' + smartWoMoValues[currentEvent.variable] + '"}';
    }
    response += "]";
    // console.log(response);
    res.end(response);
})

// handler for providing all known values ...
server.get('/getValues', function (req, res) {
	console.log("getValues gerufen");
    var response = "{";
    var firstEntry = true;
    for (var property in smartWoMoValues) {
        if (smartWoMoValues.hasOwnProperty(property)) {
            if (firstEntry == true) {
                firstEntry = false;
            } else {
                response += ",";
            }
            response += '"' + property + '"' + ':' + '"' + smartWoMoValues[property] + '"';
        }
    }
    response += "}";
    console.log(response);
    res.end(response);
})

// handler for changing values ...
server.get('/createEvent', function (req, res) {
    for (var property in req.query) {
        var changedProperties = "";
        if (req.query.hasOwnProperty(property)) {
            changedProperties += property + "=" + req.query[property] + String.fromCharCode(10);
            // add variable to message for Arduino ...
            smartWoMoValues[property] = req.query[property];
            // add changed variable to event queue
            addChangedVariableToEventQueue(property);
            // processUiEvent (property, req.query[property]);
        }
        // react on change ...
        if (property == "targetTemperature") {
			updateChatStatus();
		}
    }
    res.end("Data received !");
})

// handler for UI events ...
//function processUiEvent (variable, value) {
//	switch(variable) {
//    case "targetTemperature":
//        // sendChatMessage("Neue Wunschtemperatur: " + value + "°");
//        break;
//    default:
//        break;
//	}	
//}

// handler for chat messages ...
function processChatMessage (chatMessage) {
	if (chatMessage) {
		var words = chatMessage.split(" ");
		// console.log("<###### Chat Kommando: " + chatMessage + "#######>");
		if (words && words.length > 0) {
			var chatCommand = words[0].toLowerCase();
			if (chatCommand == "t" && words.length > 1 && (words[1].match(/^[0-9]+$/) != null)) {
				smartWoMoValues["targetTemperature"] = parseInt(words[1]);
                addChangedVariableToEventQueue("targetTemperature");
				sendChatMessage("Neue Wunschtemperatur: " + words[1] + "°");
				updateChatStatus();
			} else {
				if (chatCommand == "i") {
					var msg = "Aktuelle Temperatur: " + smartWoMoValues["temperature"] + "°";
					if (smartWoMoValues["targetTemperature"] > -999) {
						msg += "\nWunschtemperatur: " + smartWoMoValues["targetTemperature"].toString() + "°";
					}
					if (smartWoMoValues["heatingIsOn"]) {
						msg += "\nDas Wohnmobil wird gerade aufgeheizt.";
					} else {
						msg += "\nDie Heizung ist inaktiv.";
					}
					if (smartWoMoValues["humidity"] > -999) {
						msg += "\nLuftfeuchtigkeit: " + smartWoMoValues["humidity"].toString() + "%";
					}
					sendChatMessage(msg);
				} else {
					if (chatCommand == "ip") {
						detectIPAddress();						
					} else {
						msg = "Gebe eines der folgenden Kommandos ein (ohne die Anführungszeichen):";
						msg += '\n\n"t 24", um die Wunschtemperatur auf 24° zu setzen. Du kannst natürlich auch eine andere Temperatur wählen.';
						msg += '\n\n"i", um die aktuellen Infos zu erhalten.';
						msg += '\n\n"ip", um die internen IP Adressen des Rasperry zu ermitteln.';
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
		exec("ifconfig", function (error, stdout, stderr) {
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
							ips += inet[0] + " ";
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
    
    // detect current temperature (but only every 3 seconds because of slow reaction of temperature sensor)...
    // ls durch "loldht 7" ersetzen (siehe http://www.sweetpi.de/blog/436/luftfeuchtigkeit-und-temperatur-mit-dem-raspberry-pi-messen) ...
    if (Math.abs(Date.now() - timestampOfLastTemperatureDetection) > 3000) {
      timestampOfLastTemperatureDetection = Date.now();
      // console.log("Temperaturermittlung");
      // exec("cat temperatureSensorOutput", function (error, stdout, stderr) {
	  exec("loldht 7", function (error, stdout, stderr) {
        if (error == null) {
            var sentences = stdout.split("\n");
            if (stdout.indexOf("Data not good") == -1) {
                // Temperature and Humidity could be detected ...
                for (var sentence of sentences) {
                    if (sentence.indexOf("Humidity") != -1) {
                        var words = sentence.split(" ");
                        var xyz = parseFloat(words[2]);
                        var abc = Math.round(xyz).toString();
                        if (abc != smartWoMoValues["humidity"]) {
                            smartWoMoValues["humidity"] = abc;
                            addChangedVariableToEventQueue("humidity");
                            updateChatStatus();
                        }
                        xyz = parseFloat(words[6]);
                        abc = Math.round(xyz).toString();
                        if (abc != smartWoMoValues["temperature"]) {
                            smartWoMoValues["temperature"] = abc;
                            addChangedVariableToEventQueue("temperature");
                            updateChatStatus();
                        }
                    }
                }
            }
        }
      });
    }
    
    // if controller was able to detect the current temperature, check whether heating has to be switched ...
    // To Do: verify time period since last temperature detection; if it is too long ago, switch off heating ?  
    if (smartWoMoValues["temperature"] > -999) {
        
        // temperature was detected; check whether to switch heating on ...
        if ((smartWoMoValues["targetTemperature"] - smartWoMoValues["temperature"]) >= 1) {
            // current temperature is more than 1 degree lower than target temperature, so switch heating on ...
            switchHeatingOn();
        }
        // check whether heating has to be switched off ...
        if ((smartWoMoValues["temperature"] - smartWoMoValues["targetTemperature"]) >= 1) {
            // current temperature is more than 2 degree higher than target temperature, so switch heating off ...
            switchHeatingOff();
        }
        
        
    }
    
}

// controller functions ...

function switchHeatingOn() {
	// console.log("Heizung eingeschaltet !");
	if (smartWoMoValues["heatingIsOn"] == false) {
		// To Do: switch GPIO for heating relay on
		exec("gpio write 0 0", function (error, stdout, stderr) {
			if (error == null) {
				console.log("GPIO 0 (Heizungsrelais) eingeschaltet");
				smartWoMoValues["heatingIsOn"] = true;
				addChangedVariableToEventQueue("heatingIsOn");
				updateChatStatus();
			}
		});
		// console.log("Heizung eingeschaltet !"); 
	}
}
function switchHeatingOff() {
	// console.log("Heizung ausgeschaltet !");
	if (smartWoMoValues["heatingIsOn"] == true) {
		// To Do: switch GPIO for heating relay on
		exec("gpio write 0 1", function (error, stdout, stderr) {
			if (error == null) {
				console.log("GPIO 0 (Heizungsrelais) ausgeschaltet");
				smartWoMoValues["heatingIsOn"] = false;
				addChangedVariableToEventQueue("heatingIsOn");
				updateChatStatus();
			}
		});		
		// console.log("Heizung ausgeschaltet !"); 
	}
}

// run smartWoMo controller on a regular base ...
setInterval(function () { 
    smartWoMoController();
}, 500);

var port = 1111;
server.listen(port, function () {
    console.log('server listening on port ' + port);
});


