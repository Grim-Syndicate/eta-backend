import mongoose from 'mongoose';

let Schema = mongoose.Schema;

const rewardsSchema = new mongoose.Schema({
    type: String,
    chance: Number,
    rangeMin: Number,
    rangeMax: Number
}, {
  _id : false,
  versionKey: false
});

const questScriptSchema = new mongoose.Schema({
    actor: String,
    line: String,
    options: [{
      chance: Number,
      take: Number
    }]
  }, {
  _id : false,
  versionKey: false
});

let questDefinitionSchema = new Schema({
  title: String,
  shortDescription: String,
  image: String,
  planeType: String,
  planeValue: String,
  enabled: {
    type: Boolean,
    default: false,
    index: true
  },
  enabledFrom: {
    type: Number,
    index: true
  },
  enabledTo: {
    type: Number,
    index: true
  },
  stamina: Number,
  duration: Number,
  questScript: [questScriptSchema],
  rewards: [rewardsSchema],
}, {versionKey: false});

const QuestDefinition = mongoose.model('QuestDefinition', questDefinitionSchema);

export default QuestDefinition;