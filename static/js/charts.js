const plotlyConfig = {
  responsive: true,
  displaylogo: false,
  modeBarButtonsToRemove: [
    "lasso2d",
    "select2d",
    "autoScale2d",
    "toggleSpikelines",
  ],
};

const colors = {
  brand: "#6d7cff",
  brandDark: "#454ccf",
  coral: "#ff8a7a",
  mint: "#43b89d",
  amber: "#c98a22",
  blue: "#3b82f6",
  gray: "#8c8c98",
  grid: "#e7e8ee",
  ink: "#3a3a44",
};

const baseLayout = {
  margin: { l: 64, r: 24, t: 18, b: 58 },
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: { family: "Inter, system-ui, sans-serif", color: colors.ink, size: 12 },
  hoverlabel: {
    bgcolor: "#15151a",
    bordercolor: "#15151a",
    font: { color: "#fff", family: "Inter, system-ui, sans-serif" },
  },
  legend: { orientation: "h", x: 0, y: 1.14 },
};

const datasetScale = [
  { name: "GigaHands", hours: 34.0, captions: 84.0, frames: 3.7, scope: "Hands + object", setting: "Egocentric" },
  { name: "HoloAssist", hours: 161.2, captions: 1.8, frames: 17.4, scope: "Hands + object", setting: "Egocentric" },
  { name: "BOTH2Hands", hours: 8.31, captions: 23.5, frames: 1.8, scope: "Pure hands", setting: "Studio" },
  { name: "HandX", hours: 54.2, captions: 485.7, frames: 5.9, scope: "Pure hands", setting: "Studio" },
  { name: "3D-HIW", hours: 83.3, captions: 32.0, frames: 12.0, scope: "Pure hands", setting: "In the wild" },
  { name: "RoMo Hands", hours: 884.0, captions: 2710.0, frames: 95.5, scope: "Pure hands", setting: "In the wild" },
];

function scaleTrace(scope = "all") {
  const filtered = datasetScale.filter(
    (dataset) => scope === "all" || dataset.scope === "Pure hands",
  );

  return {
    type: "scatter",
    mode: "markers+text",
    x: filtered.map((dataset) => dataset.hours),
    y: filtered.map((dataset) => dataset.captions),
    text: filtered.map((dataset) => dataset.name),
    textposition: filtered.map((dataset) =>
      dataset.name === "RoMo Hands" ? "bottom left" : "top center",
    ),
    customdata: filtered.map((dataset) => [
      dataset.scope,
      dataset.setting,
      dataset.frames,
    ]),
    hovertemplate:
      "<b>%{text}</b><br>%{x:.1f} hours<br>%{y:.1f}K captions" +
      "<br>%{customdata[2]:.1f}M frames<br>%{customdata[0]} · %{customdata[1]}<extra></extra>",
    marker: {
      size: filtered.map((dataset) => 15 + Math.sqrt(dataset.frames) * 3.1),
      color: filtered.map((dataset) =>
        dataset.name === "RoMo Hands"
          ? colors.coral
          : dataset.scope === "Pure hands"
            ? colors.brand
            : colors.mint,
      ),
      opacity: 0.82,
      line: { color: "#fff", width: 2 },
    },
  };
}

function renderScale(scope = "all") {
  Plotly.react(
    "chart-scale",
    [scaleTrace(scope)],
    {
      ...baseLayout,
      showlegend: false,
      xaxis: {
        title: "Dataset duration (hours, log scale)",
        type: "log",
        gridcolor: colors.grid,
        zeroline: false,
      },
      yaxis: {
        title: "Text captions (thousands, log scale)",
        type: "log",
        gridcolor: colors.grid,
        zeroline: false,
      },
    },
    plotlyConfig,
  );
}

function renderCaptions() {
  const levels = ["L0 · tag", "L1 · short", "L2 · medium", "L3 · detailed", "L4 · paragraph"];
  const means = [3.5, 13.6, 49.4, 92.5, 149.3];

  Plotly.newPlot(
    "chart-captions",
    [
      {
        type: "bar",
        x: levels,
        y: means,
        name: "RoMo Hands",
        marker: { color: colors.brand },
        hovertemplate: "<b>%{x}</b><br>%{y:.1f} mean words<extra></extra>",
      },
      {
        type: "scatter",
        mode: "lines",
        x: levels,
        y: levels.map(() => 12.0),
        name: "GigaHands",
        line: { color: colors.coral, width: 2, dash: "dot" },
        hovertemplate: "GigaHands: 12.0 words<extra></extra>",
      },
    ],
    {
      ...baseLayout,
      barmode: "group",
      xaxis: { tickangle: -12, gridcolor: colors.grid },
      yaxis: {
        title: "Mean words per caption",
        rangemode: "tozero",
        gridcolor: colors.grid,
        zeroline: false,
      },
    },
    plotlyConfig,
  );
}

function renderUserStudy() {
  const levels = ["Tag", "Short", "Medium", "Detailed", "Paragraph"];
  Plotly.newPlot(
    "chart-user-study",
    [
      {
        type: "bar",
        name: "Overall action match",
        x: levels,
        y: [4.51, 4.19, 4.15, 4.03, 3.92],
        customdata: [89, 85, 82, 78, 72],
        marker: { color: colors.brand },
        hovertemplate:
          "<b>%{x} · overall match</b><br>Mean: %{y:.2f}/5" +
          "<br>%{customdata}% rated ≥4<extra></extra>",
      },
      {
        type: "bar",
        name: "Hand-specific faithfulness",
        x: levels,
        y: [3.96, 3.81, 3.76, 3.70, 3.74],
        customdata: [69, 70, 64, 64, 65],
        marker: { color: colors.coral },
        hovertemplate:
          "<b>%{x} · hand-specific faithfulness</b><br>Mean: %{y:.2f}/5" +
          "<br>%{customdata}% rated ≥4<extra></extra>",
      },
    ],
    {
      ...baseLayout,
      barmode: "group",
      xaxis: { tickangle: -15, gridcolor: colors.grid },
      yaxis: {
        title: "Mean Likert rating (1–5)",
        range: [0, 5],
        dtick: 1,
        gridcolor: colors.grid,
        zeroline: false,
      },
      shapes: [
        {
          type: "line",
          xref: "paper",
          x0: 0,
          x1: 1,
          y0: 3,
          y1: 3,
          line: { color: colors.gray, width: 1, dash: "dot" },
        },
      ],
      annotations: [
        {
          xref: "paper",
          yref: "y",
          x: 1,
          y: 3,
          text: "midpoint",
          showarrow: false,
          xanchor: "right",
          yanchor: "bottom",
          font: { size: 10, color: colors.gray },
        },
      ],
    },
    plotlyConfig,
  );
}

function renderActivity() {
  const datasets = ["GRAB", "GigaHands", "RoMo Hands"];
  const series = [
    { name: "Active", values: [65.6, 14.2, 53.7], color: colors.mint },
    { name: "Low", values: [34.4, 65.4, 46.1], color: colors.amber },
    { name: "Static", values: [0.0, 20.4, 0.2], color: colors.coral },
  ];

  Plotly.react(
    "chart-motion-stats",
    series.map((item) => ({
      type: "bar",
      orientation: "h",
      y: datasets,
      x: item.values,
      name: item.name,
      marker: { color: item.color },
      hovertemplate: `<b>%{y}</b><br>${item.name}: %{x:.1f}%<extra></extra>`,
    })),
    {
      ...baseLayout,
      barmode: "stack",
      margin: { l: 92, r: 24, t: 18, b: 52 },
      xaxis: {
        title: "Share of clips (%)",
        range: [0, 100],
        gridcolor: colors.grid,
        zeroline: false,
      },
      yaxis: { autorange: "reversed" },
    },
    plotlyConfig,
  );
}

function renderHistogram(statistic, options) {
  Plotly.react(
    "chart-motion-stats",
    [
      {
        type: "bar",
        x: statistic.centers,
        y: statistic.counts,
        marker: { color: options.color },
        width:
          statistic.centers.length > 1
            ? (statistic.centers[1] - statistic.centers[0]) * 0.92
            : undefined,
        hovertemplate:
          `<b>${options.hoverLabel}: %{x:.3f}</b><br>Sampled sequences: %{y:,}<extra></extra>`,
      },
    ],
    {
      ...baseLayout,
      showlegend: false,
      margin: { l: 66, r: 24, t: 18, b: 58 },
      xaxis: {
        title: options.xTitle,
        range: options.range,
        gridcolor: colors.grid,
        zeroline: false,
      },
      yaxis: {
        title: "Sampled sequences",
        gridcolor: colors.grid,
        zeroline: false,
      },
      shapes: options.shapes ?? [],
      annotations: options.annotations ?? [],
    },
    plotlyConfig,
  );
}

async function initializeMotionStatistics() {
  const response = await fetch("static/data/statistics.json");
  if (!response.ok) throw new Error(`Statistics request failed: ${response.status}`);
  const statistics = await response.json();
  const caption = document.querySelector("#motion-stats-caption");
  const buttons = [...document.querySelectorAll("[data-stat-view]")];

  const renderers = {
    activity() {
      renderActivity();
      caption.innerHTML =
        "<strong>RoMo Hands reduces static clips to 0.2%.</strong> " +
        "GRAB is choreographed studio capture; GigaHands is an uncurated egocentric stream.";
    },
    balance() {
      renderHistogram(statistics.hand_balance, {
        color: colors.brand,
        xTitle: "Left / (Left + Right) hand velocity",
        hoverLabel: "Balance",
        range: [0, 1],
        shapes: [
          {
            type: "line",
            x0: 0.5,
            x1: 0.5,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: colors.ink, width: 1, dash: "dash" },
          },
        ],
        annotations: [
          {
            x: 0.5,
            y: 1,
            yref: "paper",
            text: "balanced",
            showarrow: false,
            yanchor: "bottom",
            font: { size: 10, color: colors.gray },
          },
        ],
      });
      const classes = statistics.hand_classes;
      const total = Object.values(classes).reduce((sum, value) => sum + value, 0);
      const bimanualShare = (100 * classes.bimanual) / total;
      caption.innerHTML =
        `<strong>${bimanualShare.toFixed(1)}% of the 5K diagnostic sample is classified as bimanual.</strong> ` +
        `The mean left/right activity balance is ${statistics.hand_balance.mean.toFixed(3)}; 0.5 is balanced.`;
    },
    symmetry() {
      renderHistogram(statistics.lr_symmetry, {
        color: "#9b67d5",
        xTitle: "Left–right velocity correlation",
        hoverLabel: "Correlation",
        range: [-1, 1],
        shapes: [
          {
            type: "rect",
            x0: 0.3,
            x1: 0.7,
            y0: 0,
            y1: 1,
            yref: "paper",
            fillcolor: "rgba(67,184,157,.11)",
            line: { width: 0 },
          },
          {
            type: "line",
            x0: 0.95,
            x1: 0.95,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: colors.coral, width: 2, dash: "dash" },
          },
        ],
        annotations: [
          {
            x: 0.5,
            y: 1,
            yref: "paper",
            text: "natural bimanual band",
            showarrow: false,
            yanchor: "bottom",
            font: { size: 10, color: colors.mint },
          },
        ],
      });
      caption.innerHTML =
        `<strong>Mean left–right velocity correlation is ${statistics.lr_symmetry.mean.toFixed(3)}.</strong> ` +
        "The green band marks typical coordinated motion; values above 0.95 warrant copy-artifact inspection.";
    },
    temporal() {
      renderHistogram(statistics.autocorrelation, {
        color: colors.mint,
        xTitle: "Frame-to-frame velocity autocorrelation",
        hoverLabel: "Autocorrelation",
        range: [-1, 1],
        shapes: [
          {
            type: "rect",
            x0: 0.85,
            x1: 0.95,
            y0: 0,
            y1: 1,
            yref: "paper",
            fillcolor: "rgba(109,124,255,.12)",
            line: { width: 0 },
          },
          {
            type: "rect",
            x0: 0.97,
            x1: 1,
            y0: 0,
            y1: 1,
            yref: "paper",
            fillcolor: "rgba(255,138,122,.10)",
            line: { width: 0 },
          },
        ],
      });
      caption.innerHTML =
        `<strong>Mean temporal autocorrelation is ${statistics.autocorrelation.mean.toFixed(3)}.</strong> ` +
        "The blue band marks smooth natural motion; the far-right band can indicate frozen sequences.";
    },
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((candidate) => {
        candidate.classList.toggle("active", candidate === button);
      });
      renderers[button.dataset.statView]();
    });
  });

  renderers.activity();
}

const methodColors = {
  MDM: colors.blue,
  MoMask: colors.mint,
  Kimodo: "#e34e4e",
  MotionMillion: "#d78100",
};

async function initializeTaxonomyRadar() {
  const select = document.querySelector("#taxonomy-category");
  const caption = document.querySelector("#taxonomy-caption");
  const response = await fetch("static/data/taxonomy-benchmark.json");
  if (!response.ok) throw new Error(`Taxonomy data request failed: ${response.status}`);
  const categories = await response.json();

  categories.forEach((category, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${category.name} (n=${category.support.toLocaleString()})`;
    select.appendChild(option);
  });

  function render(index) {
    const category = categories[index];
    const theta = [...category.labels, category.labels[0]];
    const traces = category.datasets.map((dataset) => ({
      type: "scatterpolar",
      mode: "lines+markers",
      fill: "toself",
      name: dataset.label,
      theta,
      r: [...dataset.data, dataset.data[0]],
      customdata: [
        ...dataset.raw_str,
        dataset.raw_str[0],
      ],
      line: { color: methodColors[dataset.label], width: 2 },
      marker: { size: 6 },
      opacity: 0.78,
      hovertemplate:
        `<b>${dataset.label}</b><br>%{theta}: %{customdata}<extra></extra>`,
    }));

    Plotly.react(
      "chart-taxonomy",
      traces,
      {
        ...baseLayout,
        margin: { l: 55, r: 55, t: 34, b: 42 },
        polar: {
          bgcolor: "rgba(0,0,0,0)",
          radialaxis: {
            visible: true,
            range: [0, 1],
            showticklabels: false,
            gridcolor: colors.grid,
            linecolor: colors.grid,
          },
          angularaxis: { gridcolor: colors.grid, linecolor: colors.grid },
        },
        legend: { orientation: "h", x: 0.02, y: -0.08 },
      },
      plotlyConfig,
    );

    caption.innerHTML =
      `<strong>${category.name} contains ${category.support.toLocaleString()} test samples.</strong> ` +
      "The radar uses per-axis normalization for shape comparison; hover to read each raw metric.";
  }

  select.addEventListener("change", () => render(Number(select.value)));

  const preferred = categories.findIndex((category) => category.name === "Communication");
  select.value = String(preferred >= 0 ? preferred : 0);
  render(Number(select.value));
}

function initializeScaleControls() {
  document.querySelectorAll("[data-scale-scope]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-scale-scope]").forEach((candidate) => {
        candidate.classList.toggle("active", candidate === button);
      });
      renderScale(button.dataset.scaleScope);
    });
  });
}

async function initializeCharts() {
  if (!window.Plotly) {
    document.querySelectorAll(".plot").forEach((plot) => {
      plot.textContent = "Interactive chart library could not be loaded.";
      plot.classList.add("plot-error");
    });
    return;
  }

  renderScale();
  renderCaptions();
  renderUserStudy();
  initializeScaleControls();

  try {
    await initializeMotionStatistics();
  } catch (error) {
    console.error(error);
    document.querySelector("#chart-motion-stats").textContent =
      "Dataset statistics could not be loaded.";
  }

  try {
    await initializeTaxonomyRadar();
  } catch (error) {
    console.error(error);
    document.querySelector("#chart-taxonomy").textContent =
      "Taxonomy benchmark data could not be loaded.";
  }
}

window.addEventListener("DOMContentLoaded", initializeCharts);
