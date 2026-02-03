const DATA_URL = "data/vc_did_weightshare_results.json";
const LABELS_URL = "data/1000_positions_num.csv";
const MAPPING_URL = "data/mapping_between_50_and_1000_classifications.csv";

const termOrder = [
  "F2_treat",
  "o.F1_treat",
  "L0_treat",
  "L1_treat",
  "L2_treat",
  "L3_treat",
  "L4_treat",
  "L5_treat",
];

const termLabelMap = new Map([
  ["F2_treat", -2],
  ["o.F1_treat", -1],
  ["L0_treat", 0],
  ["L1_treat", 1],
  ["L2_treat", 2],
  ["L3_treat", 3],
  ["L4_treat", 4],
  ["L5_treat", 5],
]);

const colorPalette = [
  "#64ffda",
  "#5e81ac",
  "#ffcc66",
  "#f7768e",
  "#9ece6a",
  "#7aa2f7",
  "#bb9af7",
  "#ff9e64",
  "#2ac3de",
  "#c3e88d",
];

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash);
}

function getBucketHue(bucket) {
  const paletteIndex = hashString(bucket) % colorPalette.length;
  return d3.hsl(colorPalette[paletteIndex]).h;
}

function getSeriesColor(bucket, index, count) {
  const hue = getBucketHue(bucket);
  const lightnessScale = d3
    .scaleLinear()
    .domain([0, Math.max(1, count - 1)])
    .range([0.35, 0.65]);
  const lightness = lightnessScale(index);
  return d3.hsl(hue, 0.55, lightness).formatHex();
}

const chartContainer = d3.select("#chart");
const tooltip = d3.select("#tooltip");
const filterList = d3.select("#filter-list");

const margin = { top: 24, right: 18, bottom: 56, left: 74 };

const svg = chartContainer.append("svg");
const plot = svg.append("g").attr("class", "plot");
const axisX = plot.append("g").attr("class", "axis axis-x");
const axisY = plot.append("g").attr("class", "axis axis-y");
const axisXLabel = plot.append("text").attr("class", "axis-label axis-label-x");
const axisYLabel = plot.append("text").attr("class", "axis-label axis-label-y");
const eventLine = plot.append("line").attr("class", "event-line");
const zeroLine = plot.append("line").attr("class", "zero-line");
const seriesGroup = plot.append("g").attr("class", "series");

let dataByClass = new Map();
let selectedBuckets = new Set();
let classLabelMap = new Map();
let classBucketMap = new Map();

function renderEmpty(message) {
  chartContainer.selectAll(".empty-state").remove();
  chartContainer
    .append("div")
    .attr("class", "empty-state")
    .text(message);
}

function clearEmpty() {
  chartContainer.selectAll(".empty-state").remove();
}

function normalizeData(raw) {
  const filtered = raw.filter((d) => termOrder.includes(d.term));
  const grouped = d3.group(filtered, (d) =>
    String(d.position_k1000_classification)
  );
  return new Map(
    Array.from(grouped, ([key, values]) => [
      key,
      termOrder
        .map((term) => values.find((row) => row.term === term))
        .filter(Boolean),
    ])
  );
}

function normalizeLabels(raw) {
  if (!Array.isArray(raw)) {
    return new Map();
  }
  return new Map(
    raw
      .filter(
        (row) =>
          row.role_k1000_v3_num !== undefined &&
          row.role_k1000_v3 !== undefined
      )
      .map((row) => [
        String(row.role_k1000_v3_num).trim(),
        String(row.role_k1000_v3).trim(),
      ])
  );
}

function normalizeBucketMap(raw) {
  if (!Array.isArray(raw)) {
    return new Map();
  }
  return new Map(
    raw
      .filter((row) => row.role_k1000_v3 !== undefined && row.role_k50_v3 !== undefined)
      .map((row) => [
        String(row.role_k1000_v3).trim(),
        String(row.role_k50_v3).trim(),
      ])
  );
}

function getClassLabel(value) {
  return classLabelMap.get(String(value)) ?? `Class ${value}`;
}

function buildFilters(buckets) {
  filterList.selectAll("*").remove();
  buckets.forEach((value, index) => {
    const item = filterList.append("label").attr("class", "filter-item");
    item
      .append("input")
      .attr("type", "checkbox")
      .attr("value", value)
      .property("checked", selectedBuckets.has(value))
      .on("change", (event) => {
        if (event.target.checked) {
          selectedBuckets.add(value);
        } else {
          selectedBuckets.delete(value);
        }
        updateChart();
      });
    item.append("span").text(value);
    if (index === 0) {
      item.append("span").attr("class", "sr-only");
    }
  });
}

function getDimensions() {
  const { width } = chartContainer.node().getBoundingClientRect();
  const height = Math.max(440, Math.min(640, width * 0.6));
  return { width, height };
}

function updateChart() {
  clearEmpty();
  const activeSeries = Array.from(dataByClass.keys()).filter((key) =>
    selectedBuckets.has(classBucketMap.get(key))
  );
  if (activeSeries.length === 0) {
    seriesGroup.selectAll("*").remove();
    axisX.selectAll("*").remove();
    axisY.selectAll("*").remove();
    axisXLabel.text("");
    axisYLabel.text("");
    eventLine.attr("opacity", 0);
    zeroLine.attr("stroke", "none");
    renderEmpty("Select a classification to render the chart.");
    return;
  }

  const { width, height } = getDimensions();
  svg.attr("width", width).attr("height", height);
  plot.attr("transform", `translate(${margin.left},${margin.top})`);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const allPoints = activeSeries.flatMap((key) => dataByClass.get(key) || []);
  const yExtent = d3.extent(
    allPoints.flatMap((d) => [d.ci_lower, d.ci_upper])
  );

  const y = d3
    .scaleLinear()
    .domain([yExtent[0] ?? -0.05, yExtent[1] ?? 0.05])
    .nice()
    .range([innerHeight, 0]);

  const x = d3
    .scalePoint()
    .domain(termOrder)
    .range([0, innerWidth])
    .padding(0.4);

  const line = d3
    .line()
    .x((d) => x(d.term))
    .y((d) => y(d.coef));

  const area = d3
    .area()
    .x((d) => x(d.term))
    .y0((d) => y(d.ci_lower))
    .y1((d) => y(d.ci_upper));

  axisX.attr("transform", `translate(0,${innerHeight})`).call(
    d3
      .axisBottom(x)
      .tickFormat((d) => termLabelMap.get(d) ?? d)
      .tickSizeOuter(0)
  );
  axisY.call(d3.axisLeft(y).ticks(5));

  const eventX = x("o.F1_treat");
  if (eventX !== undefined) {
    eventLine
      .attr("x1", eventX)
      .attr("x2", eventX)
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("opacity", 1);
  } else {
    eventLine.attr("opacity", 0);
  }

  axisXLabel
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + margin.bottom - 12)
    .attr("text-anchor", "middle")
    .text("Year, Relative to the 1st VC Deal");

  axisYLabel
    .attr("transform", `rotate(-90)`)
    .attr("x", -innerHeight / 2)
    .attr("y", -margin.left + 16)
    .attr("text-anchor", "middle")
    .text("Change in Share of Employment");

  zeroLine
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", y(0))
    .attr("y2", y(0));

  const seriesSelection = seriesGroup
    .selectAll(".series-item")
    .data(activeSeries, (d) => d);

  const seriesEnter = seriesSelection.enter().append("g").attr("class", "series-item");

  seriesEnter.append("path").attr("class", "ci-band");
  seriesEnter.append("path").attr("class", "line");

  seriesSelection.exit().remove();

  const merged = seriesEnter.merge(seriesSelection);

  const seriesIndexByKey = new Map();
  const seriesCountByBucket = new Map();
  const groupedKeys = d3.group(activeSeries, (key) => classBucketMap.get(key));
  groupedKeys.forEach((keys, bucket) => {
    const sorted = keys.slice().sort((a, b) => Number(a) - Number(b));
    seriesCountByBucket.set(bucket, sorted.length);
    sorted.forEach((key, index) => {
      seriesIndexByKey.set(key, index);
    });
  });

  merged.each(function (key, index) {
    const group = d3.select(this);
    const seriesData = dataByClass.get(key) || [];
    const bucket = classBucketMap.get(key) ?? "Unmapped";
    const seriesIndex = seriesIndexByKey.get(key) ?? index;
    const seriesCount = seriesCountByBucket.get(bucket) ?? activeSeries.length;
    const color = getSeriesColor(bucket, seriesIndex, seriesCount);

    group
      .select(".ci-band")
      .attr("d", area(seriesData))
      .attr("fill", color)
      .attr("stroke", "none")
      .classed("visible", false);

    group
      .select(".line")
      .attr("d", line(seriesData))
      .attr("stroke", color)
      .on("mouseover", () => {
        merged.selectAll(".ci-band").classed("visible", false);
        group.select(".ci-band").classed("visible", true);
      })
      .on("mouseout", () => {
        group.select(".ci-band").classed("visible", false);
      })
      .on("click", (event) => {
        const rect = chartContainer.node().getBoundingClientRect();
        const left = event.clientX - rect.left;
        const top = event.clientY - rect.top;
        tooltip
          .text(getClassLabel(key))
          .style("left", `${left}px`)
          .style("top", `${top}px`)
          .classed("visible", true);
        window.clearTimeout(tooltip.node().hideTimeout);
        tooltip.node().hideTimeout = window.setTimeout(() => {
          tooltip.classed("visible", false);
        }, 1600);
      });
  });
}

function init(raw, mappingRaw) {
  dataByClass = normalizeData(raw);
  const bucketMap = normalizeBucketMap(mappingRaw);
  classBucketMap = new Map(
    Array.from(dataByClass.keys()).map((key) => {
      const classLabel = getClassLabel(key);
      const bucket = bucketMap.get(classLabel) ?? "Unmapped";
      return [key, bucket];
    })
  );
  const buckets = Array.from(new Set(classBucketMap.values())).sort((a, b) =>
    a.localeCompare(b)
  );
  selectedBuckets = new Set(buckets.length > 0 ? [buckets[0]] : []);
  buildFilters(buckets);
  updateChart();
  window.addEventListener("resize", () => updateChart());
}

Promise.all([
  d3.json(DATA_URL),
  d3.csv(LABELS_URL).catch(() => null),
  d3.csv(MAPPING_URL).catch(() => null),
])
  .then(([raw, labelsRaw, mappingRaw]) => {
    if (!raw || raw.length === 0) {
      renderEmpty("No data available.");
      return;
    }
    classLabelMap = normalizeLabels(labelsRaw);
    init(raw, mappingRaw);
  })
  .catch((error) => {
    console.error("Failed to load data", error);
    renderEmpty("Failed to load data.");
  });
