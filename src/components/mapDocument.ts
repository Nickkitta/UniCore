import type { GeoPoint } from '../domain/models';
export type MapProps = {
  point: GeoPoint | null;
  editable?: boolean;
  onChange?: (point: GeoPoint & { address?: string }) => void;
};
export function mapDocument(point: GeoPoint | null, editable: boolean) {
  const key = process.env.EXPO_PUBLIC_YANDEX_MAPS_API_KEY || '';
  const center = point ? [point.latitude, point.longitude] : [48.708, 44.513];
  return `<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>html,body,#map{margin:0;width:100%;height:100%;background:#eee}#error{font:14px sans-serif;padding:24px;color:#333}</style></head><body><div id="map"></div><script>
  function send(value){var message=JSON.stringify(value);if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(message);else window.parent.postMessage(message,'*')}
  function fail(){document.getElementById('map').innerHTML='<div id="error">Карта недоступна — проверь подключение или попробуй позже</div>';send({type:'error'})}
  var timeout=setTimeout(fail,20000);
  function init(){ymaps.ready(function(){try{
    var map=new ymaps.Map('map',{center:${JSON.stringify(center)},zoom:${point ? 15 : 11},controls:[]});
    map.controls.add('zoomControl',{size:'large',position:{right:12,top:12}});
    var marker=null;function pin(coords){if(marker)marker.geometry.setCoordinates(coords);else{marker=new ymaps.Placemark(coords,{}, {preset:'islands#violetIcon'});map.geoObjects.add(marker)}}
    ${point ? `pin(${JSON.stringify(center)});` : ''}
    ${
      editable
        ? `var revision=0;function choose(coords){var token=++revision;pin(coords);send({type:'point',latitude:coords[0],longitude:coords[1]});ymaps.geocode(coords,{results:1}).then(function(result){if(token!==revision)return;var item=result.geoObjects.get(0);if(item)send({type:'point',latitude:coords[0],longitude:coords[1],address:item.getAddressLine()})},function(){})}
    map.events.add('click',function(e){choose(e.get('coords'))});var centerButton=new ymaps.control.Button({data:{content:'Выбрать центр'},options:{selectOnClick:false,maxWidth:180}});map.controls.add(centerButton,{float:'left'});centerButton.events.add('click',function(){choose(map.getCenter())});`
        : ''
    }
    clearTimeout(timeout);send({type:'ready'});
  }catch(e){fail()}})}
  </script><script src="https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=ru_RU" onload="init()" onerror="fail()"></script></body></html>`;
}
export function parseMapPoint(raw: string): (GeoPoint & { address?: string }) | null {
  try {
    const data = JSON.parse(raw);
    if (
      data?.type === 'point' &&
      typeof data.latitude === 'number' &&
      typeof data.longitude === 'number' &&
      Number.isFinite(data.latitude) &&
      Number.isFinite(data.longitude) &&
      Math.abs(data.latitude) <= 90 &&
      Math.abs(data.longitude) <= 180
    )
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        ...(typeof data.address === 'string' && data.address.trim()
          ? { address: data.address.trim().slice(0, 120) }
          : {}),
      };
  } catch {
    /* Ignore messages outside our map protocol */
  }
  return null;
}
