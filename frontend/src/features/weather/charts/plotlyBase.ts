/**
 * Plotly 基础组件：把 plotly.js-dist-min 的实例绑定到 react-plotly.js 的工厂。
 *
 * 这个模块是唯一 import plotly 运行时代码的地方，单测里对它做 vi.mock 即可，
 * 无需在 jsdom 里加载体积巨大的 plotly bundle（也没有 canvas/WebGL）。
 */
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";

export const BasePlot = createPlotlyComponent(Plotly);
