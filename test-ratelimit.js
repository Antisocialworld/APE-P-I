const http = require("http");

const URL = "http://localhost:3001/api/v1/restaurants";
const TOTAL = 120;

let done = 0;
const results = {};

function fire() {
  return new Promise((resolve) => {
    const req = http.get(URL, (res) => {
      const code = String(res.statusCode);
      res.resume();
      results[code] = (results[code] || 0) + 1;
      done++;
      resolve();
    });
    req.on("error", (err) => {
      const key = "ERR:" + err.code;
      results[key] = (results[key] || 0) + 1;
      done++;
      resolve();
    });
    req.setTimeout(10000, () => { req.destroy(); });
  });
}

async function main() {
  const batchSize = 30;
  for (let batch = 0; batch < Math.ceil(TOTAL / batchSize); batch++) {
    const promises = [];
    const count = Math.min(batchSize, TOTAL - batch * batchSize);
    for (let i = 0; i < count; i++) {
      promises.push(fire());
    }
    await Promise.all(promises);
  }
  console.log(JSON.stringify(results, null, 2));
  console.log("Total:", Object.values(results).reduce((a, b) => a + b, 0));
}

main();
