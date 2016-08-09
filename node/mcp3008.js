//var SPI = require('pi-spi');

var channels = [],
    device = '/dev/spidev0.0',
    spi;

function isLegalChannel (channelNumber) {
    if (typeof channelNumber !== 'number' || channelNumber < 0 || channelNumber > 7) {
        throw new Error("Channel must be a number from 0 to 7");
    }
}

function read(channel, callback) {
    console.log('read Chanel ' + channel);
    if (spi === undefined)
        return;

    return 1;
}


function poll(channel, duration, callback) {

}

function startPoll (channel, callback) {
  spi = 'test'
}

function stop (channel) {

}

function close (channel) {

}

var Mcp3008 = function (dev) {
    console.log('Initialize Mcp3008');

    this.read = read;
    this.poll = poll;
    this.stop = stop;
    this.close = close;

};

module.exports = Mcp3008;
