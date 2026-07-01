const homes = ["A", "B", "C", "D"];

const records = [
  { month: "26.1", meters: { A: 19001, B: 9629, C: 11513, D: 10073 }, totalAmount: 0 },
  { month: "26.3", meters: { A: 19370, B: 9728, C: 11662, D: 10438 }, totalAmount: 605.1 },
  { month: "26.4", meters: { A: 19419, B: 9769, C: 11692, D: 10563 }, totalAmount: 223.4 },
  { month: "26.5", meters: { A: 19543, B: 9804, C: 11746, D: 10688 }, totalAmount: 266 },
];

const expected = {
  "26.3": { totalUsage: 982, A: 227.374643584521, B: 61.0029531568228, C: 91.8125254582485, D: 224.909877800407 },
  "26.4": { totalUsage: 245, A: 44.68, B: 37.385306122449, C: 27.3551020408163, D: 113.979591836735 },
  "26.5": { totalUsage: 338, A: 97.585798816568, B: 27.5443786982249, C: 42.4970414201183, D: 98.3727810650888 },
};

function calculateRows(source) {
  return source.map((record, index) => {
    const previous = source[index - 1];
    const usage = Object.fromEntries(homes.map((home) => [home, previous ? record.meters[home] - previous.meters[home] : 0]));
    const totalUsage = homes.reduce((sum, home) => sum + usage[home], 0);
    const amounts = Object.fromEntries(homes.map((home) => [home, totalUsage > 0 ? (usage[home] / totalUsage) * record.totalAmount : 0]));
    return { ...record, usage, totalUsage, amounts };
  });
}

function assertClose(actual, target, label) {
  if (Math.abs(actual - target) > 0.000001) {
    throw new Error(`${label}: expected ${target}, got ${actual}`);
  }
}

for (const row of calculateRows(records)) {
  if (!expected[row.month]) continue;
  assertClose(row.totalUsage, expected[row.month].totalUsage, `${row.month} totalUsage`);
  for (const home of homes) {
    assertClose(row.amounts[home], expected[row.month][home], `${row.month} ${home}`);
  }
}

console.log("calculation verification passed");
