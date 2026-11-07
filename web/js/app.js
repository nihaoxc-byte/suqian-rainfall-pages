'use strict';
const $ = id => document.getElementById(id);
const state = {stations: [], records: [], charts: [], cache: new Map(), loading: 0};
const load = async path => {const r = await fetch(path, {cache: 'no-cache'}); if (!r.ok) throw new Error(`读取失败：${r.status}`); return r.json();};
function option(parent, value, text) {const o = document.createElement('option'); o.value = value; o.textContent = text; parent.append(o);}
function message(id, text) {$(id).textContent = text; $(id).hidden = false;}
function selectStation(id, fromMap = false) {
  $('station').value = id;
  if (fromMap) $('search').value = '';
  render();
  if (window.innerWidth <= 900) $('trend').scrollIntoView({behavior:'smooth'});
}
function initMap(layout) {
  state.layout = layout;
  state.zoom = 1;
  const ns = 'http://www.w3.org/2000/svg';
  const names = new Map(state.stations.map(s => [s.id,s.name]));
  $('mapCanvas').setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  for (const point of layout.stations) {
    if (!names.has(point.id)) continue;
    const group = document.createElementNS(ns,'g');
    group.classList.add('map-pin'); group.dataset.station = point.id;
    group.setAttribute('transform',`translate(${point.x} ${point.y})`);
    group.setAttribute('role','button'); group.setAttribute('tabindex','0');
    group.setAttribute('aria-label',`选择${names.get(point.id)}站`);
    const title = document.createElementNS(ns,'title'); title.textContent=names.get(point.id); group.append(title);
    for (const [radius,cls] of [[13,'pin-hit'],[9,'pin-halo'],[4.5,'pin-dot']]) {
      const circle = document.createElementNS(ns,'circle'); circle.setAttribute('r',radius); circle.setAttribute('class',cls); group.append(circle);
    }
    const text = document.createElementNS(ns,'text'); text.textContent=names.get(point.id);
    text.setAttribute('x',10); text.setAttribute('y',-8); group.append(text);
    group.onclick=()=>selectStation(point.id,true);
    group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectStation(point.id,true);}};
    $('mapPins').append(group);
  }
}
function zoomMap(factor) {
  if (!state.layout) return;
  state.zoom = factor === 0 ? 1 : Math.max(1,Math.min(4,state.zoom*factor));
  const {width,height,stations} = state.layout;
  const point = stations.find(p=>p.id===$('station').value) || {x:width/2,y:height/2};
  const w=width/state.zoom,h=height/state.zoom;
  const x=Math.max(0,Math.min(width-w,point.x-w/2)),y=Math.max(0,Math.min(height-h,point.y-h/2));
  $('mapCanvas').setAttribute('viewBox',`${x} ${y} ${w} ${h}`);
  $('zoomOut').disabled=state.zoom===1; $('zoomIn').disabled=state.zoom===4;
}
function updateMap(station, query) {
  const selected = state.stations.find(s=>s.id===station);
  $('selectedName').textContent=selected?.name??'请选择站点';
  $('trendStation').textContent=selected?.name??'站点';
  const item=state.records.find(r=>r.station_id===station&&r.date===$('date').value);
  $('selectedValue').textContent=item ? `${Number(item.rainfall_mm).toFixed(1)} mm` : '—';
  $('selectedStatus').textContent=item ? '源站昨日降水量' : '暂无有效日值';
  const names=new Map(state.stations.map(s=>[s.id,s.name]));
  for (const pin of [...$('mapPins').children]) {
    const active=pin.dataset.station===station;
    pin.classList.toggle('is-selected',active);
    pin.classList.toggle('is-dimmed',!names.get(pin.dataset.station)?.includes(query));
    pin.setAttribute('aria-pressed',String(active));
    pin.querySelector('text').textContent=names.get(pin.dataset.station);
    if(active) pin.parentNode.append(pin);
  }
  if(state.zoom>1) zoomMap(1);
}
function initCharts() {
  if (!window.echarts) return;
  state.trend = echarts.init($('trendChart'), null, {renderer:'svg'});
  state.rank = echarts.init($('rankChart'), null, {renderer:'svg'});
  state.charts = [state.trend, state.rank];
  new ResizeObserver(() => state.charts.forEach(c => c.resize())).observe(document.querySelector('main'));
}
function render() {
  const date = $('date').value, station = $('station').value;
  const query = $('search').value.trim();
  const daily = state.records.filter(r => r.date === date);
  const byId = new Map(daily.map(r => [r.station_id, r]));
  const shown = state.stations.filter(s => s.name.includes(query));
  $('stationRows').replaceChildren();
  for (const s of shown) {
    const item = byId.get(s.id), button = document.createElement('button');
    button.textContent = s.name; button.className = 'station-button';
    button.classList.toggle('is-active',s.id===station);
    button.setAttribute('aria-pressed',String(s.id===station));
    button.title=item ? `${Number(item.rainfall_mm).toFixed(1)} mm` : '暂无有效日值';
    button.onclick = () => selectStation(s.id);
    $('stationRows').append(button);
  }
  $('resultCount').textContent = `显示 ${shown.length} / ${state.stations.length} 个站点`;
  updateMap(station,query);
  $('export').disabled = !state.records.length;
  // Include missing calendar dates as null; missing values must not become zero or join across gaps.
  const dates = [...new Set(state.records.map(r => r.date))].sort();
  const series = state.records.filter(r => r.station_id === station);
  if (dates.length) {
    const start = new Date(dates[0]+'T00:00:00Z'), end = new Date(dates.at(-1)+'T00:00:00Z');
    dates.length = 0;
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate()+1)) dates.push(d.toISOString().slice(0,10));
  }
  if (series.length && state.trend) {
    const values = new Map(series.map(r => [r.date, Number(r.rainfall_mm)]));
    $('trendEmpty').hidden = true;
    state.trend.setOption({animation:false,tooltip:{trigger:'axis',renderMode:'richText'},grid:{left:45,right:22,top:30,bottom:55},xAxis:{type:'category',data:dates.map(d=>d.slice(5))},yAxis:{type:'value',name:'mm',min:0},dataZoom:[{type:'inside'}],series:[{type:'bar',data:dates.map(d=>values.get(d)??null),itemStyle:{color:'#168a98',borderRadius:[3,3,0,0]},barMaxWidth:28}]},true);
  } else {state.trend?.clear(); message('trendEmpty', !window.echarts ? '图表组件未能加载。站点查询和数据导出仍可使用。' : '当前站点暂无有效历史日值。');}
  const ranked = [...daily].sort((a,b)=>Number(b.rainfall_mm)-Number(a.rainfall_mm)||a.station_name.localeCompare(b.station_name,'zh-CN')).slice(0,10).reverse();
  if (ranked.length && state.rank) {
    $('rankEmpty').hidden = true;
    state.rank.setOption({animation:false,tooltip:{trigger:'axis',renderMode:'richText'},grid:{left:100,right:40,top:10,bottom:30},xAxis:{type:'value',name:'mm',min:0},yAxis:{type:'category',data:ranked.map(r=>r.station_name)},series:[{type:'bar',data:ranked.map(r=>Number(r.rainfall_mm)),itemStyle:{color:'#168a98',borderRadius:[0,3,3,0]},barMaxWidth:18,label:{show:true,position:'right'}}]},true);
  } else {state.rank?.clear(); message('rankEmpty', !window.echarts ? '图表组件未能加载。' : '暂无可排名的有效日值。');}
}
async function loadMonth() {
  const month = $('month').value, request = ++state.loading;
  $('export').disabled = true;
  try {
    const records = month ? (state.cache.get(month) || await load(`data/months/${month}.json`)) : [];
    if (request !== state.loading) return;
    if (month) state.cache.set(month, records);
    state.records = records;
    $('date').replaceChildren();
    const dates = [...new Set(records.map(r=>r.date))].sort().reverse();
    dates.forEach(d=>option($('date'),d,d));
    if (!dates.length) option($('date'),'','暂无日值');
    $('date').disabled = !dates.length;
    render();
  } catch (e) {
    if (request !== state.loading) return;
    state.records=[]; $('date').replaceChildren(); option($('date'),'','加载失败'); $('date').disabled=true;
    message('notice','本月数据加载失败，请刷新后重试。'); render();
  }
}
function exportCsv() {
  const month = $('month').value;
  if (!state.records.length || !/^\d{4}-\d{2}$/.test(month)) return;
  const a = document.createElement('a');
  a.href = `data/exports/rainfall-${month}.csv`;
  a.download = `宿迁日雨量-${month}.csv`;
  a.click();
}
async function main() {
  try {
    const [stations,status,months,layout] = await Promise.all([load('data/stations.json'),load('data/status.json'),load('data/months.json'),load('data/station-layout.json')]);
    state.stations=stations;
    $('stationCount').textContent=status.station_count;
    $('recordCount').textContent=status.record_count.toLocaleString();
    $('latestDate').textContent=status.latest_date??'待核验';
    $('lastCollection').textContent=status.last_collection_at ? new Date(status.last_collection_at).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'}) : '尚未开始';
    $('collectionHint').textContent=status.last_collection_at ? `最近运行状态：${status.last_collection_state}` : '离线样本不计为正式采集';
    $('notice').textContent=status.message+(status.conflict_count ? ` 有 ${status.conflict_count} 项冲突待复核，已暂停发布这些记录。` : '');
    $('station').replaceChildren(); stations.forEach(s=>option($('station'),s.id,s.name)); $('station').disabled=!stations.length;
    const initial = stations.find(s=>s.name==='宿迁闸'); if(initial) $('station').value=initial.id;
    initMap(layout); $('zoomOut').disabled=true;
    $('month').replaceChildren(); months.forEach(m=>option($('month'),m,m));
    if (!months.length) option($('month'),'','暂无日值'); $('month').disabled=!months.length;
    initCharts(); await loadMonth();
  } catch (e) {message('notice','数据未能加载，请刷新重试。首次使用请通过网页服务访问本页。');}
}
$('search').addEventListener('input',render); $('station').addEventListener('change',render);
$('date').addEventListener('change',render); $('month').addEventListener('change',loadMonth);
$('export').addEventListener('click',exportCsv); main();
$('showLabels').addEventListener('change',()=>{$('mapCanvas').classList.toggle('show-labels',$('showLabels').checked);});
$('zoomIn').addEventListener('click',()=>zoomMap(1.3));
$('zoomOut').addEventListener('click',()=>zoomMap(1/1.3));
$('zoomReset').addEventListener('click',()=>zoomMap(0));
