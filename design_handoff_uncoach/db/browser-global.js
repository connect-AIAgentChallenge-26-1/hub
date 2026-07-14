// 결(結) — 프로토타입용 전역 데이터 클라이언트 (비-모듈 일반 스크립트)
//
// 자체 런타임 프로토타입(.dc.html/로컬 실행)은 ES 모듈 import가 어렵고 file:// 에선
// type=module 이 CORS로 막히므로, 일반 스크립트로 window.UncoachStore 를 노출한다.
// 배포(http)에서 /api/data 로 전체 상태 blob을 저장·조회하고, file:// 나 서버 없음일 땐
// 호출이 실패하므로 프로토타입은 localStorage로 그대로 폴백한다.

(function () {
  var DEVICE_KEY = 'uncoach-device-id';

  function getDeviceId() {
    var id = null;
    try { id = localStorage.getItem(DEVICE_KEY); } catch (e) {}
    if (!id) {
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem(DEVICE_KEY, id); } catch (e) {}
    }
    return id;
  }

  function call(action, extra) {
    var body = { action: action };
    if (extra) for (var k in extra) body[k] = extra[k];
    return fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-id': getDeviceId() },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
        return data;
      });
    });
  }

  window.UncoachStore = {
    getDeviceId: getDeviceId,
    loadBlob: function () { return call('loadBlob'); },              // → { state }
    saveBlob: function (state) { return call('saveBlob', { state: state }); },
  };
})();
