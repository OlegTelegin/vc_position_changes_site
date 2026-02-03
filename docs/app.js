const DATA_URL = "data/vc_did_weightshare_results.json";
const LABELS_URL = "data/1000_positions_num.csv";
const MAPPING_URL = "data/mapping_between_50_and_1000_classifications.csv";
const SCORES_URL = "data/cc_ser_scores_for_1000_positions.csv";
const CORR_URL = "data/corr_w_wfd_sm.csv";
const PCTILE_URL = "data/max_coef_pctile_for_1000_positions.csv";
const POPULARITY_URL = "data/position_popularity_pctile_for_1000_positions.csv";

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
const groupingSelect = d3.select("#grouping-mode");

const margin = { top: 24, right: 46, bottom: 56, left: 74 };

const svg = chartContainer.append("svg");
const plot = svg.append("g").attr("class", "plot");
const axisX = plot.append("g").attr("class", "axis axis-x");
const axisY = plot.append("g").attr("class", "axis axis-y");
const axisXLabel = plot.append("text").attr("class", "axis-label axis-label-x");
const axisYLabel = plot.append("text").attr("class", "axis-label axis-label-y");
const eventLine = plot.append("line").attr("class", "event-line");
const zeroLine = plot.append("line").attr("class", "zero-line");
const seriesGroup = plot.append("g").attr("class", "series");
const markersGroup = plot.append("g").attr("class", "markers");

let dataByClass = new Map();
let selectedBuckets = new Set();
let selectedBucketsByMode = new Map();
let bucketMapByMode = new Map();
let bucketsByMode = new Map();
let groupingMode = "buckets50";
let classLabelMap = new Map();
let classBucketMap = new Map();
let scoresByRole = new Map();
let correlationByRoleNum = new Map();
let tooltipDismissBound = false;

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

function normalizePctileMap(raw, valueKey) {
  if (!Array.isArray(raw)) {
    return new Map();
  }
  return new Map(
    raw
      .filter(
        (row) =>
          row.position_k1000_classification !== undefined &&
          row[valueKey] !== undefined
      )
      .map((row) => [
        String(row.position_k1000_classification).trim(),
        Number(row[valueKey]),
      ])
      .filter(([, value]) => Number.isFinite(value))
  );
}

function pctileLabel(bucket) {
  const high = bucket * 5;
  const low = high - 4;
  return `${low}-${high}th percentile`;
}

function normalizeScores(raw) {
  if (!Array.isArray(raw)) {
    return new Map();
  }
  const map = new Map();
  raw.forEach((row) => {
    const role = row.role_k1000_v3?.trim();
    if (!role) {
      return;
    }
    const cc = Number(row.position_cc_indicator_emb);
    const ser = Number(row.position_ser_indicator_emb);
    if (!map.has(role)) {
      map.set(role, { cc: [], ser: [] });
    }
    const entry = map.get(role);
    if (Number.isFinite(cc)) {
      entry.cc.push(cc);
    }
    if (Number.isFinite(ser)) {
      entry.ser.push(ser);
    }
  });
  return map;
}

function normalizeCorrelations(raw) {
  if (!Array.isArray(raw)) {
    return new Map();
  }
  return new Map(
    raw
      .filter(
        (row) =>
          row.role_k1000_v3_num !== undefined &&
          row.corr_w_wfd_sm !== undefined
      )
      .map((row) => [
        String(row.role_k1000_v3_num).trim(),
        Number(row.corr_w_wfd_sm),
      ])
      .filter(([, value]) => Number.isFinite(value))
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

function applyGrouping(mode) {
  groupingMode = mode;
  const buckets = bucketsByMode.get(mode) || [];
  classBucketMap = bucketMapByMode.get(mode) || new Map();
  let selected = selectedBucketsByMode.get(mode);
  if (!selected) {
    selected = new Set(buckets.length > 0 ? [buckets[0]] : []);
    selectedBucketsByMode.set(mode, selected);
  }
  selectedBuckets = selected;
  buildFilters(buckets);
  updateChart();
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
    markersGroup.selectAll("*").remove();
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
  const coefExtent = d3.extent(allPoints, (d) => d.coef);
  const minLine = coefExtent[0] ?? -0.05;
  const maxLine = coefExtent[1] ?? 0.05;
  const upperCap = maxLine * 1.1;
  const lowerCap = minLine * 1.1;
  const topPad = Math.max(0.0005, Math.abs(maxLine) * 0.02);
  const bottomPad = Math.max(0.0005, Math.abs(minLine) * 0.02);

  const clampCi = (value) => Math.min(Math.max(value, lowerCap), upperCap);
  const ciExtent = d3.extent(
    allPoints.flatMap((d) => [clampCi(d.ci_lower), clampCi(d.ci_upper)])
  );
  const minY = Math.min(minLine, ciExtent[0] ?? minLine);
  const maxY = Math.max(maxLine, ciExtent[1] ?? maxLine);

  const y = d3
    .scaleLinear()
    .domain([minY - bottomPad, maxY + topPad])
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
    .y0((d) => y(clampCi(d.ci_lower)))
    .y1((d) => y(clampCi(d.ci_upper)));

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
  seriesEnter.append("path").attr("class", "hit-line");

  seriesSelection.exit().remove();

  const merged = seriesEnter.merge(seriesSelection);

  const seriesIndexByKey = new Map();
  const seriesCountByBucket = new Map();
  const colorByKey = new Map();
  const groupedKeys = d3.group(activeSeries, (key) => classBucketMap.get(key));
  groupedKeys.forEach((keys, bucket) => {
    const sorted = keys.slice().sort((a, b) => Number(a) - Number(b));
    seriesCountByBucket.set(bucket, sorted.length);
    sorted.forEach((key, index) => {
      seriesIndexByKey.set(key, index);
      colorByKey.set(
        key,
        getSeriesColor(bucket ?? "Unmapped", index, sorted.length)
      );
    });
  });

  const seriesByKey = new Map();
  const scoreBucketsByRole = scoresByRole;
  const correlationScale = d3.scaleLinear().domain([-1, 1]).range([0, 1]);
  const correlationColor = d3.scaleLinear().domain([0, 1]).range(["#7aa2f7", "#ff9e64"]);
  const histogramWidth = 200;
  const histogramHeight = 70;
  const histogramMargin = { top: 8, right: 8, bottom: 18, left: 20 };
  const histogramBins = d3.bin().domain([0, 10]).thresholds(10);

  const renderHistogram = (container, values) => {
    const svgNode = container
      .append("svg")
      .attr("width", histogramWidth)
      .attr("height", histogramHeight);
    const innerWidth =
      histogramWidth - histogramMargin.left - histogramMargin.right;
    const innerHeight =
      histogramHeight - histogramMargin.top - histogramMargin.bottom;
    const plot = svgNode
      .append("g")
      .attr(
        "transform",
        `translate(${histogramMargin.left},${histogramMargin.top})`
      );

    const bins = histogramBins(values);
    const yMax = d3.max(bins, (bin) => bin.length) ?? 1;
    const xScale = d3.scaleLinear().domain([0, 10]).range([0, innerWidth]);
    const yScale = d3.scaleLinear().domain([0, yMax]).range([innerHeight, 0]);

    plot
      .selectAll("rect")
      .data(bins)
      .enter()
      .append("rect")
      .attr("x", (d) => xScale(d.x0))
      .attr("y", (d) => yScale(d.length))
      .attr("width", (d) => Math.max(0, xScale(d.x1) - xScale(d.x0) - 1))
      .attr("height", (d) => innerHeight - yScale(d.length))
      .attr("class", "tooltip-bar");

    plot
      .append("g")
      .attr("class", "tooltip-axis")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(3));
  };

  const renderTooltipContent = (key) => {
    const label = getClassLabel(key);
    const roleNum = String(key);
    tooltip.selectAll("*").remove();
    tooltip.append("div").attr("class", "tooltip-title").text(label);

    const corrValue = correlationByRoleNum.get(roleNum);
    if (Number.isFinite(corrValue)) {
      const normalized = correlationScale(Math.max(-1, Math.min(1, corrValue)));
      tooltip
        .append("div")
        .attr("class", "tooltip-corr")
        .html(
          `Correlation with actual S&M investment in WFD: <span style="color: ${correlationColor(
            normalized
          )};">${corrValue.toFixed(3)}</span>`
        );
    }

    const scores = scoreBucketsByRole.get(label);
    if (!scores || (scores.cc.length === 0 && scores.ser.length === 0)) {
      tooltip
        .append("div")
        .attr("class", "tooltip-empty")
        .text("No score data available.");
      return;
    }

    const charts = tooltip.append("div").attr("class", "tooltip-charts");
    const ccWrapper = charts.append("div").attr("class", "tooltip-chart");
    ccWrapper
      .append("div")
      .attr("class", "tooltip-chart-title")
      .text("CC scores of positions (LLM)");
    renderHistogram(ccWrapper, scores.cc);

    const serWrapper = charts.append("div").attr("class", "tooltip-chart");
    serWrapper
      .append("div")
      .attr("class", "tooltip-chart-title")
      .text("SER scores of positions (LLM)");
    renderHistogram(serWrapper, scores.ser);
  };
  const showCiForKey = (key) => {
    merged.selectAll(".ci-band").classed("visible", false);
    const target = seriesByKey.get(key);
    if (target) {
      target.select(".ci-band").classed("visible", true);
    }
  };
  const hideCiForKey = (key) => {
    const target = seriesByKey.get(key);
    if (target) {
      target.select(".ci-band").classed("visible", false);
    }
  };
  const showTooltip = (key, event) => {
    event.stopPropagation();
    const rect = chartContainer.node().getBoundingClientRect();
    renderTooltipContent(key);
    tooltip.classed("visible", true).style("left", "0px").style("top", "0px");
    const tooltipNode = tooltip.node();
    const tooltipWidth = tooltipNode.offsetWidth || 0;
    const tooltipHeight = tooltipNode.offsetHeight || 0;
    const padding = 8;
    const desiredLeft =
      event.clientX - rect.left - tooltipWidth - 24;
    const desiredTop =
      event.clientY - rect.top - tooltipHeight - 24;
    const left = Math.min(
      rect.width - tooltipWidth - padding,
      Math.max(padding, desiredLeft)
    );
    const top = Math.min(
      rect.height - tooltipHeight - padding,
      Math.max(padding, desiredTop)
    );
    tooltip.style("left", `${left}px`).style("top", `${top}px`);
    window.clearTimeout(tooltip.node().hideTimeout);
    tooltip.node().hideTimeout = window.setTimeout(() => {
      tooltip.classed("visible", false);
    }, 7000);
  };

  merged.each(function (key, index) {
    const group = d3.select(this);
    const seriesData = dataByClass.get(key) || [];
    const color = colorByKey.get(key) ?? colorPalette[index % colorPalette.length];
    seriesByKey.set(key, group);

    group
      .select(".ci-band")
      .attr("d", area(seriesData))
      .attr("fill", color)
      .attr("stroke", "none")
      .classed("visible", false);

    group.select(".line").attr("d", line(seriesData)).attr("stroke", color);

    group
      .select(".hit-line")
      .attr("d", line(seriesData))
      .on("mouseover", () => showCiForKey(key))
      .on("mouseout", () => hideCiForKey(key))
      .on("click", (event) => showTooltip(key, event));
  });

  const markersData = activeSeries
    .map((key) => {
      const seriesData = dataByClass.get(key) || [];
      const lastPoint = seriesData[seriesData.length - 1];
      if (!lastPoint) {
        return null;
      }
      return {
        key,
        color: colorByKey.get(key) ?? colorPalette[0],
        anchorX: x(lastPoint.term) ?? 0,
        targetY: y(lastPoint.coef),
      };
    })
    .filter(Boolean);

  const minSeparation = 12;
  const markerRadius = 4;
  const sortedMarkers = markersData
    .slice()
    .sort((a, b) => a.targetY - b.targetY);
  sortedMarkers.forEach((marker, idx) => {
    if (idx === 0) {
      marker.y = marker.targetY;
    } else {
      marker.y = Math.max(
        marker.targetY,
        sortedMarkers[idx - 1].y + minSeparation
      );
    }
  });
  for (let i = sortedMarkers.length - 2; i >= 0; i -= 1) {
    sortedMarkers[i].y = Math.min(
      sortedMarkers[i].y,
      sortedMarkers[i + 1].y - minSeparation
    );
  }
  if (sortedMarkers.length > 0) {
    const minBound = markerRadius;
    const maxBound = innerHeight - markerRadius;
    const totalSpan = (sortedMarkers.length - 1) * minSeparation;
    if (totalSpan > maxBound - minBound) {
      const step = (maxBound - minBound) / Math.max(1, sortedMarkers.length - 1);
      sortedMarkers.forEach((marker, idx) => {
        marker.y = minBound + step * idx;
      });
    } else {
      const minY = sortedMarkers[0].y;
      const maxY = sortedMarkers[sortedMarkers.length - 1].y;
      if (minY < minBound) {
        const delta = minBound - minY;
        sortedMarkers.forEach((marker) => {
          marker.y += delta;
        });
      }
      if (maxY > maxBound) {
        const delta = maxY - maxBound;
        sortedMarkers.forEach((marker) => {
          marker.y -= delta;
        });
      }
    }
    sortedMarkers.forEach((marker) => {
      marker.y = Math.max(minBound, Math.min(maxBound, marker.y));
    });
  }

  const markerSelection = markersGroup
    .selectAll(".marker")
    .data(sortedMarkers, (d) => d.key);

  const markerEnter = markerSelection.enter().append("g").attr("class", "marker");
  markerEnter.append("line").attr("class", "marker-connector");
  markerEnter.append("circle").attr("class", "marker-dot");
  markerEnter.append("circle").attr("class", "marker-hit");

  markerSelection.exit().remove();

  const markerMerged = markerEnter.merge(markerSelection);
  const markerX = innerWidth + 10;

  markerMerged
    .select(".marker-connector")
    .attr("x1", (d) => d.anchorX)
    .attr("x2", markerX)
    .attr("y1", (d) => d.targetY)
    .attr("y2", (d) => d.y)
    .attr("stroke", (d) => d.color);

  markerMerged
    .select(".marker-dot")
    .attr("cx", markerX)
    .attr("cy", (d) => d.y)
    .attr("r", markerRadius)
    .attr("fill", (d) => d.color);

  markerMerged
    .select(".marker-hit")
    .attr("cx", markerX)
    .attr("cy", (d) => d.y)
    .attr("r", markerRadius + 6)
    .on("mouseover", (event, d) => showCiForKey(d.key))
    .on("mouseout", (event, d) => hideCiForKey(d.key))
    .on("click", (event, d) => showTooltip(d.key, event));
}

function init(raw, mappingRaw, pctileRaw, popularityRaw) {
  dataByClass = normalizeData(raw);
  const bucketMap = normalizeBucketMap(mappingRaw);
  const bucketMap50 = new Map(
    Array.from(dataByClass.keys()).map((key) => {
      const classLabel = getClassLabel(key);
      const bucket = bucketMap.get(classLabel) ?? "Unmapped";
      return [key, bucket];
    })
  );
  const buckets50 = Array.from(new Set(bucketMap50.values())).sort((a, b) =>
    a.localeCompare(b)
  );
  bucketMapByMode.set("buckets50", bucketMap50);
  bucketsByMode.set("buckets50", buckets50);

  const pctileMap = normalizePctileMap(pctileRaw, "max_coef_pctile");
  const bucketLabelByNum = new Map();
  Array.from(pctileMap.values()).forEach((bucketNum) => {
    if (!bucketLabelByNum.has(bucketNum)) {
      bucketLabelByNum.set(bucketNum, pctileLabel(bucketNum));
    }
  });
  const bucketMapPctile = new Map(
    Array.from(dataByClass.keys()).map((key) => {
      const bucketNum = pctileMap.get(String(key));
      const label = bucketNum ? bucketLabelByNum.get(bucketNum) : "Unmapped";
      return [key, label ?? "Unmapped"];
    })
  );
  const bucketsPctile = Array.from(new Set(bucketMapPctile.values())).sort(
    (a, b) => {
      if (a === "Unmapped") return 1;
      if (b === "Unmapped") return -1;
      const numA = Number(a.split("-")[0]);
      const numB = Number(b.split("-")[0]);
      return numB - numA;
    }
  );
  bucketMapByMode.set("pctile", bucketMapPctile);
  bucketsByMode.set("pctile", bucketsPctile);

  const popularityMap = normalizePctileMap(
    popularityRaw,
    "position_popularity_pctile"
  );
  const popularityLabelByNum = new Map();
  Array.from(popularityMap.values()).forEach((bucketNum) => {
    if (!popularityLabelByNum.has(bucketNum)) {
      popularityLabelByNum.set(bucketNum, pctileLabel(bucketNum));
    }
  });
  const bucketMapPopularity = new Map(
    Array.from(dataByClass.keys()).map((key) => {
      const bucketNum = popularityMap.get(String(key));
      const label = bucketNum
        ? popularityLabelByNum.get(bucketNum)
        : "Unmapped";
      return [key, label ?? "Unmapped"];
    })
  );
  const bucketsPopularity = Array.from(
    new Set(bucketMapPopularity.values())
  ).sort((a, b) => {
    if (a === "Unmapped") return 1;
    if (b === "Unmapped") return -1;
    const numA = Number(a.split("-")[0]);
    const numB = Number(b.split("-")[0]);
    return numB - numA;
  });
  bucketMapByMode.set("popularity", bucketMapPopularity);
  bucketsByMode.set("popularity", bucketsPopularity);

  groupingSelect.property("value", groupingMode);
  applyGrouping(groupingMode);
  groupingSelect.on("change", (event) => {
    applyGrouping(event.target.value);
  });
  window.addEventListener("resize", () => updateChart());
  if (!tooltipDismissBound) {
    tooltipDismissBound = true;
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (tooltip.node()?.contains(target)) {
        return;
      }
      tooltip.classed("visible", false);
    });
  }
}

Promise.all([
  d3.json(DATA_URL),
  d3.csv(LABELS_URL).catch(() => null),
  d3.csv(MAPPING_URL).catch(() => null),
  d3.csv(SCORES_URL).catch(() => null),
  d3.csv(CORR_URL).catch(() => null),
  d3.csv(PCTILE_URL).catch(() => null),
  d3.csv(POPULARITY_URL).catch(() => null),
])
  .then(
    ([
      raw,
      labelsRaw,
      mappingRaw,
      scoresRaw,
      corrRaw,
      pctileRaw,
      popularityRaw,
    ]) => {
    if (!raw || raw.length === 0) {
      renderEmpty("No data available.");
      return;
    }
    classLabelMap = normalizeLabels(labelsRaw);
    scoresByRole = normalizeScores(scoresRaw);
    correlationByRoleNum = normalizeCorrelations(corrRaw);
    init(raw, mappingRaw, pctileRaw, popularityRaw);
  })
  .catch((error) => {
    console.error("Failed to load data", error);
    renderEmpty("Failed to load data.");
  });
