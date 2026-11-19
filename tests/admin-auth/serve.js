const { MongoMemoryServer } = require('mongodb-memory-server');
process.argv[2] = process.argv[2] || require('path').join(__dirname, '..', '..');
const { seed, startServer } = require('./e2e.js');
(async () => {
  const mongo = await MongoMemoryServer.create();
  await seed(mongo.getUri());
  const { p } = await startServer(mongo.getUri(), process.argv[3] || 'enforce');
  p.stdout.pipe(process.stdout); p.stderr.pipe(process.stderr);
  console.log('READY on 3999');
})();
