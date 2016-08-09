#!/bin/bash

# To Do's:
#   - services enablen (z.B. hostapd)
#   - Routes einbauen

echo ""
echo "smartWoMo: Die Installation von smartWoMo beginnt. Die einzelnen Schritte können mehrere Minuten dauern. Das ist völlig normal."
echo "ACHTUNG: Du wirst eventuell zwischendurch aufgefordert, dein Kennwort einzugeben !"
echo ""

echo "smartWoMo: Deutschen Paketserver wählen ..."
echo "Bitte warten ..."
echo ""

sudo cp /etc/apt/sources.list /etc/apt/sources.list.original
sudo cp /home/pi/smartwomo/templates/sources.list /etc/apt/sources.list

echo "smartWoMo: Es wird eine Aktualisierung der derzeit installierten Software durchgeführt ..."
echo "Bitte warten ..."
echo ""

sudo apt-get update && sudo apt-get upgrade -y

#echo ""
#echo "smartWoMo: Jetzt wird die legacy Version von node installiert."
#echo "Bitte warten ..."
#echo ""
#
# sudo apt-get install -y nodejs-legacy

echo ""
echo "smartWoMo: Wiring Pi wird installiert. Mit Hilfe dieses Hilfsprogramms werden die Ein- und Ausgänge des Raspberry angesteuert,"
echo "um Sensordaten zu lesen und Relais zu schalten."
echo "Bitte warten ..."
echo ""

sudo apt-get install -y git

cd /tmp/ 
git clone git://git.drogon.net/wiringPi 
cd wiringPi 
./build 
rm -rf /tmp/wiringPi/

echo "smartWoMo: Um den Temperatursensor DHT22 auszulesen, gibt es ein eigenes Hilfsprogramm namens loldht, das jetzt installiert wird."
echo "Bitte warten ..."
echo ""

cd /tmp
git clone https://github.com/technion/lol_dht22
cd lol_dht22
./configure
make
sudo cp depcomp /usr/bin
sudo cp loldht /usr/bin
sudo chmod +s /usr/bin/loldht

echo ""
echo "smartWoMo: smartWoMo nutzt ein Framework namens node.js, das ebenfalls installiert werden muss - inklusive zugehörigem Paketmanager npm."
echo "Bitte warten ..."
echo ""

cd /home/pi/smartwomo/node
wget http://node-arm.herokuapp.com/node_latest_armhf.deb
sudo dpkg -i node_latest_armhf.deb
sudo apt-get install -y npm
npm config set registry http://registry.npmjs.org/
npm config set strict-ssl false
npm install express
sudo npm cache clean -f
sudo npm install -g n
sudo n stable
npm install node-xmpp-client

echo ""
echo "smartWoMo: Um sichzustellen, dass smartWoMo nach Abbrüchen automatisch neu gestartet wird, wird jetzt ein Supervisor installiert und konfiguriert."
echo "Bitte warten ..."
echo ""

sudo apt-get install -y supervisor
sudo cp /home/pi/smartwomo/templates/smartWoMo.configuration /home/pi/smartwomo/node
sudo chown pi:pi /home/pi/smartwomo/node/smartWoMo.configuration
sudo chmod 644 /home/pi/smartwomo/node/smartWoMo.configuration
sudo cp /home/pi/smartwomo/templates/smartwomo.conf /etc/supervisor/conf.d
sudo cp /home/pi/smartwomo/templates/smartwomoconfig.conf /etc/supervisor/conf.d
sudo service supervisor restart

echo ""
echo "smartWoMo: Nun wird Samba installiert. Das ermöglicht dir, von einem PC oder Mac Computer aus auf das Dateisystem des Raspberry zuzugreifen."
echo "Bitte warten ..."
echo ""

sudo apt-get install -y samba-common samba
sudo mv /etc/samba/smb.conf /etc/samba/smb.conf.original
sudo cp /home/pi/smartwomo/templates/smb.conf /etc/samba/smb.conf
echo -e 'smartwomo\nsmartwomo' | sudo smbpasswd -a pi

echo ""
echo "smartWoMo: Als nächstes sorgt smartWoMo dafür, dass drahtlose Netzwerke nach Verbindungsabbrüchen automatisch wieder verbunden werden."
echo ""

sudo cp /etc/wpa_supplicant/ifupdown.sh /etc/ifplugd/action.d/ifupdown

echo ""
echo "smartWoMo: Nun wird die Bibliothek für den Analog/Digitalwandler MCP3008 installiert."
echo "Bitte warten ..."
echo ""

cd /home/pi/smartwomo/node && npm install mcp3008.js

echo ""
echo "smartWoMo: es werden die Programme installiert, um smartWoMo als Access Point verwenden zu können."
echo "Bitte warten ..."
echo ""

sudo apt-get install -y usb-modeswitch
sudo cp /home/pi/smartwomo/templates/75-usb-modeswitch.rules /etc/udev/rules.d
sudo systemctl start hostapd
cd /tmp
sudo wget https://jankarres.de/wp-content/uploads/2015/06/hostapd_8188CUS.zip
sudo unzip hostapd_8188CUS.zip
sudo rm hostapd_8188CUS.zip
sudo mv /usr/sbin/hostapd /usr/sbin/hostapd.original
sudo mv hostapd /usr/sbin/hostapd
sudo chmod +x /usr/sbin/hostapd
sudo mv /etc/hostapd/hostapd.conf /etc/hostapd/hostapd.conf.original
sudo cp /home/pi/smartwomo/templates/hostapd.conf /etc/hostapd/hostapd.conf
sudo mv /etc/default/hostapd /etc/default/hostapd.original
sudo cp /home/pi/smartwomo/templates/hostapd /etc/default/hostapd
sudo mv /etc/network/interfaces /etc/network/interfaces.original
sudo cp /home/pi/smartwomo/templates/interfaces /etc/network/interfaces

sudo apt-get install -y hostapd
sudo systemctl enable hostapd

sudo apt-get install isc-dhcp-server
sudo mv /etc/default/isc-dhcp-server /etc/default/isc-dhcp-server.original
sudo cp /home/pi/smartwomo/templates/isc-dhcp-server /etc/default/isc-dhcp-server
sudo mv /etc/dhcp3/dhcpd.conf /etc/dhcp3/dhcpd.conf.original
sudo cp /home/pi/smartwomo/templates/dhcpd.conf /etc/dhcp3/dhcpd.conf

echo ""
echo "smartWoMo: nun wird dafür gesorgt, dass USB Sticks automatisch in das Dateisystem eingebunden werden."
echo "Bitte warten ..."
echo ""

sudo apt-get install -y usbmount
sudo mv /etc/usbmount/usbmount.conf /etc/usbmount/usbmount.conf.original
sudo cp /home/pi/smartwomo/templates/usbmount.conf /etc/usbmount/usbmount.conf

#echo ""
#echo "Aufräumen, bitte warten ..."
#echo ""
#
#rm -rf /home/pi/smartwomo/templates
#rm /home/pi/smartwomo/install.sh

echo ""
echo "smartWoMo: Die Installation von smartWoMo ist beendet."
echo "Bitte starte den Raspberry jetzt neu, damit alle Änderungen wirksam werden können ..."