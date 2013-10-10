var util = require('util'),
    dgram = require('dgram'),
    UUID = require('./UUID.js'),
    winston = require('winston'),
    zlib = require('zlib'),
    os = require('os'),
    events = require('events');
var self = {};


require('./bufferjs');
require('./bufferjs/concat');

CMN = new Array();
CMN.UncompressedData = '\u0040';
CMN.GZipData = '\u0041';
CMN.DeflateData = '\u0042';

LMN = new Array();
LMN.ZlfUnknownLayout = '\u0020';
LMN.ZlfEdsXmlLayout = '\u0021';
LMN.ZlfLog4jSchemaXmlLayout = '\u0022';

var ZLF = exports.ZLF = winston.transports.ZLF = function (options) {
  if(!options.host || !options.port) {
    throw new Error('winston-zlf - Host or Port are not defined');
  }
  this.host = options.host;
  this.port = options.port;
  this.name = 'ZLF';
  this.level = options.level || 'info';
  this.facility = options.facility;
  this.realm = options.realm;
  this.subrealm = options.subrealm;
  this.maxBodyLength = options.maxBodyLength;
  this.compressionMode = options.compressionMode || 'uncompressed';

  this.client = dgram.createSocket("udp4");
  this.uuid = new UUID();
  this.clientNumber = process.pid;
  switch (this.compressionMode) {
    case "uncompressed":
      this.CMNValue = CMN.UncompressedData;
      this.compressMethod = undefined;
      break;
    case "gzip":
      this.CMNValue = CMN.GZipData;
      this.compressMethod = zlib.gzip;
      break;
    default:
      this.CMNValue = CMN.UncompressedData;
      this.compressMethod = undefined;
      break;
  }
  this.LMNValue = LMN.ZlfLog4jSchemaXmlLayout;
  this.sequenceNumber = 0;

  self = this;
};
//
// Inherit from `winston.Transport` so you can take advantage
// of the base functionality and `.handleExceptions()`.
//
util.inherits(ZLF, winston.Transport);

ZLF.prototype.log = function (level, msg, meta, callback) {
  var now = new Date(),
      timestamp = now.getTime()- (now.getTimezoneOffset() * 60000),
      facility = this.facility;

  if (this.realm === 'SEE') {
    //SEE specific
    if (msg.indexOf(' - ') != -1) {
      facility = _p.trim(msg.split(' - ')[0].split(']')[1]);
      msg = msg.replace(msg.split(' - ')[0] + ' - ', '');
    } else if (msg.indexOf(']') != -1) {
      msg = msg.replace(msg.split(']')[1], '');
    } else {
      msg = msg;
    }
  }

  var body = '<log4j:event logger="' + facility + '" timestamp="' + timestamp + '" sequenceNumber="' + this.sequenceNumber + '" level="' + level.toUpperCase()  + '" thread="' + this.clientNumber + '">'
    + '<log4j:message>' + msg + '</log4j:message>'
    + '<log4j:properties>';
  if (meta) body +='<log4j:data name="meta" value="' + _p.serialize(meta) + '"/>';
  if (this.realm) body +='<log4j:data name="Realm" value="' + this.realm + '"/>';
  if (this.subrealm) body +='<log4j:data name="SubRealm" value="' + this.subrealm + '"/>';
  body += '<log4j:data name="hostname" value="' + os.hostname() + '"/>'
       + '<log4j:data name="log4net:HostName" value="' + os.hostname() + '"/>'
       + '</log4j:properties>'
       + '</log4j:event>';
  switch(this.compressMethod){
    case zlib.gzip: 
      this.compressMethod(body, _p.compressCallback);
      break;
    default: 
      _p.setChunks(body);
      break;
  }
  this.sequenceNumber++;
  callback(null, true);
};

var _p = {
  'sendPacket': function (packet) {
    try {
      self.client.send(packet, 0, packet.length, self.port, self.host);
    } catch (e) {
      console.error(e);
    }
  },
  'decimalToHex': function (d, padding) {
    var hex = Number(d).toString(16);
    padding = !padding ? padding = 2 : padding;
    while (hex.length < padding) {
      hex = "0" + hex;
    }
    return hex;
  },
  'convertDecimalToByte': function (number, padding) {
    var raw = _p.decimalToHex(number, padding * 2),
        buff = new Buffer(raw, 'hex'),
        buffer_aux = new Buffer(padding),
        idx = 0;
    for (var i = buff.length - 1; i >= 0; i--) {
      buffer_aux[idx++] = buff[i];
    }
    return buffer_aux;
  },
  'compressCallback': function (err, packet) {
    if (err) {
      console.error(err.stack);
    } else {
      _p.setChunks(packet);
    }
  },
  'buildFinalPacket': function(bodyBuffer, messageId, chunkIndex, totalChunks){
    header = self.CMNValue + self.LMNValue + _p.convertDecimalToByte(0, 2) + messageId + _p.convertDecimalToByte(totalChunks, 4) + _p.convertDecimalToByte(chunkIndex, 4);
    var headerBuffer = new Buffer(header, 'binary');
    var dataLengthBuffer = new Buffer(_p.convertDecimalToByte(bodyBuffer.length, 4), 'binary');
    var finalPackage = Buffer.concat(headerBuffer, dataLengthBuffer, bodyBuffer);
    _p.sendPacket(finalPackage);
  },
  'setChunks': function(body){
    var bodyBuffer = new Buffer(body, 'binary'),
        messageId = self.uuid.generate(16);
    if (bodyBuffer.length > self.maxBodyLength) {
      var totalChunks = Math.ceil(bodyBuffer.length / self.maxBodyLength),
          slicedBuffer = null, endIndex = 0;
      for (var i = 0; i < totalChunks; i++) {
        endIndex = (i == totalChunks - 1 ? bodyBuffer.length : (self.maxBodyLength * (i + 1)));
        slicedBuffer = bodyBuffer.slice((self.maxBodyLength * i), endIndex);
        _p.buildFinalPacket(slicedBuffer, messageId, i, totalChunks); //only 1 chunk
      };
    } else {
      _p.buildFinalPacket(bodyBuffer, messageId, 0, 1); //only 1 chunk
    }
  },
  'serialize': function (obj, key) {
    if (obj === null) {
      obj = 'null';
    }
    else if (obj === undefined) {
      obj = 'undefined';
    }
    else if (obj === false) {
      obj = 'false';
    }

    if (typeof obj !== 'object') {
      return key ? key + '=' + obj : obj;
    }

    if (obj instanceof Buffer) {
      return key ? key + '=' + obj.toString('base64') : obj.toString('base64');
    }

    var msg = '',
        keys = Object.keys(obj),
        length = keys.length;

    for (var i = 0; i < length; i++) {
      if (Array.isArray(obj[keys[i]])) {
        msg += keys[i] + '=[';

        for (var j = 0, l = obj[keys[i]].length; j < l; j++) {
          msg += _p.serialize(obj[keys[i]][j]);
          if (j < l - 1) {
            msg += ', ';
          }
        }

        msg += ']';
      }
      else if (obj[keys[i]] instanceof Date) {
        msg += keys[i] + '=' + obj[keys[i]];
      }
      else {
        msg += _p.serialize(obj[keys[i]], keys[i]);
      }

      if (i < length - 1) {
        msg += ', ';
      }
    }

    return msg;
  },
  'trim': function(msg){
    return msg.replace(/^\s+|\s+$/g, '');
  }
};