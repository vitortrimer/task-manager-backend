//handle mongodb connection with the project

const mongoose = require('mongoose');

mongoose.Promise = global.Promise;
mongoose.connect(`mongodb+srv://${process.env.NODE_ENV_MONGODB_DBNAME}:${process.env.NODE_ENV_MONGODB_PASSWORD}@${process.env.NODE_ENV_MONGODB_USERNAME}.hoqtn.mongodb.net`, { useNewUrlParser: true }).then(() => {
  console.log("Sucessfully connected to MongoDB!");
}).catch((e) => {
  console.log('An error ocurred while attempting to connect MongoDB!');
  console.log(e);
});

mongoose.set('useCreateIndex', true);
mongoose.set('useFindAndModify', false);

module.exports = {
  mongoose
}