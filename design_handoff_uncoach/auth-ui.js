// 결(結) — 로그인/회원가입 오버레이 (이메일 + Google)
//
// 커스텀 런타임(React) 앱을 건드리지 않도록, 앱 위에 뜨는 독립 DOM 오버레이로 구현한다.
// - 익명으로 쓰다가 회원가입하면 계정을 '연결(link)'해 기존 데이터(Firestore users/{uid})를 유지.
// - 기존 계정 로그인은 해당 계정 uid로 전환.
// - 로그인/로그아웃 성공 시 새로고침 → 앱이 새 uid로 상태를 다시 로드.
//
// 필요한 콘솔 설정: Authentication에서 '이메일/비밀번호'와 'Google' 제공업체 사용 설정.

(function () {
  if (typeof firebase === 'undefined' || !firebase.auth) return;
  var auth = firebase.auth();

  var style = document.createElement('style');
  style.textContent = [
    '#uc-auth-btn{position:fixed;top:12px;right:12px;z-index:9998;font:600 13px/1 -apple-system,"Noto Sans KR",sans-serif;background:#182430;color:#fff;border:none;border-radius:999px;padding:9px 14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)}',
    '#uc-auth-overlay{position:fixed;inset:0;z-index:9999;background:rgba(10,20,30,.45);display:none;align-items:center;justify-content:center}',
    '#uc-auth-overlay.on{display:flex}',
    '#uc-auth-modal{background:#fff;color:#182430;width:340px;max-width:92vw;border-radius:16px;padding:24px;font:14px/1.6 -apple-system,"Noto Sans KR","Malgun Gothic",sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.25)}',
    '#uc-auth-modal h3{margin:0 0 4px;font-size:18px;font-weight:800}',
    '#uc-auth-modal .sub{color:#5b6b7a;font-size:12px;margin-bottom:16px}',
    '#uc-auth-modal input{width:100%;box-sizing:border-box;border:1px solid #dde5ec;border-radius:10px;padding:11px 12px;font-size:14px;margin-bottom:10px}',
    '#uc-auth-modal .primary{width:100%;background:#2e6da8;color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px}',
    '#uc-auth-modal .google{width:100%;background:#fff;color:#182430;border:1px solid #dde5ec;border-radius:10px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px}',
    '#uc-auth-modal .toggle{background:none;border:none;color:#2e6da8;font-size:13px;cursor:pointer;padding:4px}',
    '#uc-auth-modal .err{color:#bf4545;font-size:12px;min-height:16px;margin:2px 0 6px}',
    '#uc-auth-modal .x{float:right;background:none;border:none;font-size:20px;line-height:1;cursor:pointer;color:#5b6b7a}',
  ].join('');
  document.head.appendChild(style);

  function start() {
    var mode = 'login';

    var btn = document.createElement('button');
    btn.id = 'uc-auth-btn';
    btn.textContent = '로그인';
    document.body.appendChild(btn);

    var overlay = document.createElement('div');
    overlay.id = 'uc-auth-overlay';
    overlay.innerHTML =
      '<div id="uc-auth-modal">' +
      '<button class="x" id="uc-x" aria-label="닫기">×</button>' +
      '<h3 id="uc-title">로그인</h3>' +
      '<div class="sub">이메일로 로그인하거나 구글로 계속하세요.</div>' +
      '<input id="uc-email" type="email" placeholder="이메일" autocomplete="email">' +
      '<input id="uc-pw" type="password" placeholder="비밀번호 (6자 이상)" autocomplete="current-password">' +
      '<div class="err" id="uc-err"></div>' +
      '<button class="primary" id="uc-submit">로그인</button>' +
      '<button class="google" id="uc-google">Google로 계속</button>' +
      '<div style="text-align:center"><button class="toggle" id="uc-toggle">계정이 없으신가요? 회원가입</button></div>' +
      '</div>';
    document.body.appendChild(overlay);

    var el = function (id) { return document.getElementById(id); };
    var open = function () { el('uc-err').textContent = ''; overlay.classList.add('on'); };
    var close = function () { overlay.classList.remove('on'); };

    function setMode(m) {
      mode = m;
      el('uc-title').textContent = m === 'login' ? '로그인' : '회원가입';
      el('uc-submit').textContent = m === 'login' ? '로그인' : '회원가입';
      el('uc-toggle').textContent = m === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인';
      el('uc-pw').setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
      el('uc-err').textContent = '';
    }

    function msg(code) {
      var m = {
        'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
        'auth/missing-password': '비밀번호를 입력하세요.',
        'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
        'auth/email-already-in-use': '이미 가입된 이메일입니다. 로그인해 주세요.',
        'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
        'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
        'auth/user-not-found': '가입되지 않은 이메일입니다.',
        'auth/too-many-requests': '시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
        'auth/popup-closed-by-user': '구글 로그인이 취소되었습니다.',
        'auth/credential-already-in-use': '이미 사용 중인 계정입니다. 로그인해 주세요.',
        'auth/operation-not-allowed': '이 로그인 방식이 콘솔에서 활성화되지 않았습니다.',
      };
      return m[code] || ('오류: ' + code);
    }
    var done = function () { location.reload(); };
    var fail = function (e) { el('uc-err').textContent = msg(e && e.code); };

    el('uc-x').onclick = close;
    overlay.onclick = function (e) { if (e.target === overlay) close(); };
    el('uc-toggle').onclick = function () { setMode(mode === 'login' ? 'signup' : 'login'); };

    el('uc-submit').onclick = function () {
      var email = el('uc-email').value.trim();
      var pw = el('uc-pw').value;
      el('uc-err').textContent = '';
      if (mode === 'signup') {
        var cur = auth.currentUser;
        var cred = firebase.auth.EmailAuthProvider.credential(email, pw);
        var p = (cur && cur.isAnonymous)
          ? cur.linkWithCredential(cred)                 // 익명 → 계정 연결(데이터 유지)
          : auth.createUserWithEmailAndPassword(email, pw);
        p.then(done).catch(function (e) {
          if (e.code === 'auth/email-already-in-use' || e.code === 'auth/credential-already-in-use') setMode('login');
          fail(e);
        });
      } else {
        auth.signInWithEmailAndPassword(email, pw).then(done).catch(fail);
      }
    };

    el('uc-google').onclick = function () {
      var provider = new firebase.auth.GoogleAuthProvider();
      var cur = auth.currentUser;
      var p = (cur && cur.isAnonymous) ? cur.linkWithPopup(provider) : auth.signInWithPopup(provider);
      p.then(done).catch(function (e) {
        if (e.code === 'auth/credential-already-in-use') {
          auth.signInWithPopup(provider).then(done).catch(fail);
        } else fail(e);
      });
    };

    // 로그인 상태에 따라 버튼 갱신
    auth.onAuthStateChanged(function (user) {
      if (user && !user.isAnonymous) {
        btn.textContent = (user.email || '계정') + ' · 로그아웃';
        btn.onclick = function () { if (window.confirm('로그아웃할까요?')) auth.signOut().then(done); };
      } else {
        btn.textContent = '로그인';
        btn.onclick = open;
      }
    });
  }

  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);
})();
