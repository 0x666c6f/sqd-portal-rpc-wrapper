import DefaultTheme from 'vitepress/theme';
import LatencyChart from '../components/LatencyChart.vue';
import BatchChart from '../components/BatchChart.vue';
import SpeedupChart from '../components/SpeedupChart.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LatencyChart', LatencyChart);
    app.component('BatchChart', BatchChart);
    app.component('SpeedupChart', SpeedupChart);
  }
};
