/* global measureIndex */
// Author: Kai-Uwe Pielka - March, 2016

var configuration = new Object();
// configuration.password = "";
configuration.useChat = "false";
configuration.jabberService = "";
configuration.jabberUser = "";
configuration.jabberPassword = "";
configuration.myJabberUser = "";

// file system api ...
var fs = require('fs');

// read configuration from file ...
configuration = JSON.parse(fs.readFileSync('smartWoMo.configuration', 'utf8'));

var http = require('http');

// enable to execute shell commands ...
var sys = require('sys')
var exec = require('child_process').exec;

// receive and process data from User Interface ...
var express = require('express');
var server = express();

// handler for static files ...
server.use(express.static(__dirname + '/publicConfig'));

// handler for providing configuration parameters ...
server.get('/getConfiguration', function(req, res) {
    var response = "";
    response = JSON.stringify(configuration);
    res.end(response);
});

// handler for saving configuration data ...
server.get('/setConfiguration', function(req, res) {
    for (var property in req.query) {
        // var changedProperties = "";
        if (req.query.hasOwnProperty(property)) {
            if (property == "sambaPassword") {
                if (req.query[property].length > 0) changeSambaPassword(req.query[property]);
            } else {
                if (property == "password") {
                    if (req.query[property].length > 0) changePassword(req.query[property]);
                } else {

                    if (property == "shutdown") {
                        if (req.query[property] != "restartSmartWoMo") shutdown(req.query[property]);
                    } else {
                        configuration[property] = req.query[property];
                        console.log(property + ":" + req.query[property])
                    }
                }
            }
        }
    }
    saveConfiguration();
    // shutdown("restartSmartWoMo");
    var response = "";
    response = JSON.stringify(configuration);
    res.end(response);
});

function saveConfiguration() {
    fs.writeFile("smartWoMo.configuration", JSON.stringify(configuration));
}

function changeSambaPassword(newPassword) {
    console.log("Samba Password Change requested: " + newPassword);
    // change samba password ...
    cmd = "echo -e '" + newPassword + "\n" + newPassword + "' | sudo smbpasswd -a pi";
    exec(cmd, function(error, stdout, stderr) {
        if (error != null) {
            console.log("Fehler beim Ändern des Samba Kennworts: " + stderr);
        }
    });   
}

function changePassword(newPassword) {
    console.log("Password Change requested: " + newPassword);
    // change logon password ...
    exec('echo "pi:' + newPassword + '" | sudo chpasswd', function(error, stdout, stderr) {
        if (error != null) {
            console.log("Fehler beim Ändern des Anmeldekennworts: " + stderr);
        }
    });
    // change password of Wireless Network that is created by hostapd ...
    hostapdFile = "hostapd.conf";
    fs.readFileSync("/etc/hostapd/hostapd.conf").toString().split(/\r?\n/).forEach(function(line) {
        words = line.split("=");
        if (words[0] == "wpa_passphrase") {
            // console.log("wpa_passphrase=" + newPassword);
            fs.appendFileSync(hostapdFile, "wpa_passphrase=" + newPassword + "\n");
        } else {
            if (line != "") {
                // console.log(line);
                fs.appendFileSync(hostapdFile, line + "\n");
            }
        }
    });
    // console.log("###########");
    // console.log('sudo mv ' + hostapdFile + ' /etc/hostapd && sudo service hostapd restart');
    exec('sudo mv ' + hostapdFile + ' /etc/hostapd && sudo service hostapd restart', function(error, stdout, stderr) {
        if (error != null) {
            console.log("Fehler beim Ändern des WLAN Kennworts: " + stderr);
        }
    });

    // change Samba password ...
    // $command    = 'echo "'.$newpasswd1.'\n'.$newpasswd2.'\n" | sudo /usr/bin/smbpasswd -s -a '.$Uid;
}

function shutdown(command) {
    if (command == "reboot") {
        console.log("Der Raspberry wird neu gestartet !");
        exec('sudo shutdown -r now', function(error, stdout, stderr) {
            if (error != null) {
                console.log("Fehler beim Neustart des Raspberry: " + stderr);
            }
        });
    } else {
        if (command == "restartSmartWoMo") {
            console.log("smartWoMo wird neu gestartet !");
            exec('sudo supervisorctl restart smartwomo', function(error, stdout, stderr) {
                if (error != null) {
                    console.log("Fehler beim Neustart von smartwomo: " + stderr);
                }
            });
        } else {
            if (command == "shutdown") {
                console.log("Der Raspberry wird herunter gefahren !");
                exec('sudo shutdown -h now', function(error, stdout, stderr) {
                    if (error != null) {
                        console.log("Fehler beim Runterfahren des Raspberry: " + stderr);
                    }
                });
            }
        }
    }
}

var port = 1112;
server.listen(port, function() {
    console.log('server listening on port ' + port);
});
