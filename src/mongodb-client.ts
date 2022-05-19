import { connect, Mongoose } from 'mongoose';

const dbURL = process.env.DB_FULL_URL;
const uri = dbURL;

const options = {
   useNewUrlParser: true,
   useUnifiedTopology: true,
   maxIdleTimeMS: 10000,
   serverSelectionTimeoutMS: 10000,
   socketTimeoutMS: 20000,
};

let clientPromise: Promise<Mongoose>;

if (!global._mongoClientPromise) {
  console.log('connecting to mongoose')
  global._mongoClientPromise = connect(uri, options);
}

clientPromise = global._mongoClientPromise;

export default clientPromise;