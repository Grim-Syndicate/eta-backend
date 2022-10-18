import mongoose from 'mongoose';

let Schema = mongoose.Schema;
/*
const rewardsSchema = new mongoose.Schema({
    type: String,
    chance: Number,
    rangeMin: Number,
    rangeMax: Number
}, {
  _id : false,
  versionKey: false
});
*/
const stepRewardsSchema = new mongoose.Schema({
  chance: Number,
  rangeMin: Number,
  rangeMax: Number,
  name: String,
  type: String,
  image: String
}, {
_id : false,
versionKey: false
});

const questEditorSchema = new mongoose.Schema({
  position: {
    x: Number,
    y: Number
  },
}, {
_id : false,
versionKey: false
});

const questScriptSchema = new mongoose.Schema({
    id: String,
    editor: questEditorSchema,
    progressType: String,
    actor: String,
    line: String,
    duration: Number,
    options: [{
      chance: Number,
      take: Number,
      goToStepId: String
    }],
    userChoices: [{
      text: String,
      goToStepId: String
    }],
    rewards: [stepRewardsSchema],
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
}, {versionKey: false});

const QuestDefinition = mongoose.model('QuestDefinition', questDefinitionSchema);

export default QuestDefinition;