import mongoose from 'mongoose';

let Schema = mongoose.Schema;

const pendingSchema = new mongoose.Schema({
    quest: {
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'QuestExecution'
    },
    stamina: Number,
    id: Number,
    timestamp: Number
}, {
  _id : false,
  versionKey: false
});

let staminaSchema = new Schema({
  // _id: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: 'Token',
  //   index: true
  // },
  stamina: {
    type: Number,
    default: 0
  },
  maxStamina: {
    type: Number,
    default: 50
  },
  pendingStamina: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Number
  },
  pending: [pendingSchema]
}, {versionKey: false});

const Stamina = mongoose.model('Stamina', staminaSchema);

export default Stamina;