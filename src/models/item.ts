import mongoose from 'mongoose';

let Schema = mongoose.Schema;

let itemSchema = new Schema({
  name: String,
  description: String,
  type: String,
  image: String,
}, {versionKey: false});

const ItemDefinition = mongoose.model('ItemDefinition', itemSchema);

export default ItemDefinition;