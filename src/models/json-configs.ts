import mongoose from 'mongoose';

let Schema = mongoose.Schema;

let configSchema = new Schema({
  name: {
    type: String,
    index: true
  },
  config: Object,
  timestamp: Number
}, {versionKey: false});

const JSONConfigs = mongoose.model('JSONConfig', configSchema);

export default JSONConfigs;