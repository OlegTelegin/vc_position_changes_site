const DATA_URL = "data/vc_did_weightshare_results.json";

const termOrder = [
  "F2_treat",
  "o.F1_treat",
  "L0_treat",
  "L1_treat",
  "L2_treat",
  "L3_treat",
  "L4_treat",
  "L5_treat",
  "L6_treat",
  "L7_treat",
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
  ["L6_treat", 6],
  ["L7_treat", 7],
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

const chartContainer = d3.select("#chart");
const tooltip = d3.select("#tooltip");
const filterList = d3.select("#filter-list");

const margin = { top: 24, right: 18, bottom: 36, left: 52 };

const svg = chartContainer.append("svg");
const plot = svg.append("g").attr("class", "plot");
const axisX = plot.append("g").attr("class", "axis axis-x");
const axisY = plot.append("g").attr("class", "axis axis-y");
const zeroLine = plot.append("line").attr("class", "zero-line");
const seriesGroup = plot.append("g").attr("class", "series");

let dataByClass = new Map();
let selectedClasses = new Set();

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

function buildFilters(classes) {
  filterList.selectAll("*").remove();
  classes.forEach((value, index) => {
    const item = filterList.append("label").attr("class", "filter-item");
    item
      .append("input")
      .attr("type", "checkbox")
      .attr("value", value)
      .property("checked", true)
      .on("change", (event) => {
        if (event.target.checked) {
          selectedClasses.add(value);
        } else {
          selectedClasses.delete(value);
        }
        updateChart();
      });
    item.append("span").text(`Class ${value}`);
    if (index === 0) {
      item.append("span").attr("class", "sr-only");
    }
  });
}

function getDimensions() {
  const { width } = chartContainer.node().getBoundingClientRect();
  const height = Math.max(380, Math.min(520, width * 0.5));
  return { width, height };
}

function updateChart() {
  clearEmpty();
  const activeSeries = Array.from(selectedClasses);
  if (activeSeries.length === 0) {
    seriesGroup.selectAll("*").remove();
    axisX.selectAll("*").remove();
    axisY.selectAll("*").remove();
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

  merged.each(function (key, index) {
    const group = d3.select(this);
    const seriesData = dataByClass.get(key) || [];
    const color = colorPalette[index % colorPalette.length];

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
          .text(`Class ${key}`)
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

function init(raw) {
  dataByClass = normalizeData(raw);
  const classes = Array.from(dataByClass.keys()).sort((a, b) => Number(a) - Number(b));
  selectedClasses = new Set(classes);
  buildFilters(classes);
  updateChart();
  window.addEventListener("resize", () => updateChart());
}

d3.json(DATA_URL)
  .then((raw) => {
    if (!raw || raw.length === 0) {
      renderEmpty("No data available.");
      return;
    }
    init(raw);
  })
  .catch((error) => {
    console.error("Failed to load data", error);
    renderEmpty("Failed to load data.");
  });
