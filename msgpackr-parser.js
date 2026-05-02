const { Packr } = require('msgpackr');
const { EventEmitter } = require('events');

const packr = new Packr({ useRecords: false });

const protocol = 5;

class Encoder {
  encode(packet) {
    return [packr.pack(packet)];
  }
}

class Decoder extends EventEmitter {
  add(chunk) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const decoded = packr.unpack(buf);
    this.emit('decoded', decoded);
  }

  destroy() {}
}

module.exports = { protocol, Encoder, Decoder };
