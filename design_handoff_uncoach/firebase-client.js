// 결(結) — 브라우저 Firebase 클라이언트 (Firestore 백엔드 + 익명 로그인)
//
// 프로토타입의 window.UncoachStore 인터페이스(loadBlob/saveBlob)를 그대로 유지하되,
// 저장소를 /api/data(Postgres) 대신 Firestore(users/{uid} 문서)로 바꾼다.
// → 프로토타입의 mount/persist/logout 훅을 수정 없이 재사용한다.
//
// 인증: 익명 로그인으로 시작(로그인 없이 사용). 나중에 이메일/구글 계정으로 연결(link)하면
//       같은 uid에 데이터가 유지된다("헬스장" 모델 → 계정 승격).
//
// ⚠️ 아래 firebaseConfig는 콘솔 > 프로젝트 설정 > 웹 앱에서 복사해 넣으세요.
//    이 값들은 공개 값입니다(비밀 아님). 실제 보호는 Firestore 보안 규칙 + App Check로 합니다.

(function () {
  var firebaseConfig = {
    apiKey: 'AIzaSyB3zuuFZsCTaiv_wQhL54xaqnT1pIWfiMo',
    authDomain: 'unco-965ab.firebaseapp.com',
    projectId: 'unco-965ab',
    storageBucket: 'unco-965ab.firebasestorage.app',
    messagingSenderId: '472939229958',
    appId: '1:472939229958:web:a312d798948a011d72e487',
    measurementId: 'G-LZB40SMQRP',
  };

  if (typeof firebase === 'undefined') {
    console.warn('[uncoach] Firebase SDK가 로드되지 않았습니다. 로컬 저장으로만 동작합니다.');
    return; // window.UncoachStore 미설정 → 프로토타입은 localStorage로 폴백
  }

  firebase.initializeApp(firebaseConfig);
  var auth = firebase.auth();
  var dbf = firebase.firestore();

  // 인증 준비. 로그인 세션이 있으면(이메일/구글 계정) 그걸 쓰고, 없을 때만 익명으로 시작한다.
  // (무조건 익명 로그인하면 로그인한 계정이 매번 익명으로 덮여버린다.)
  var ready = new Promise(function (resolve) {
    var settled = false;
    auth.onAuthStateChanged(function (user) {
      if (settled) return;
      if (user) { settled = true; resolve(user); return; }
      auth.signInAnonymously()
        .then(function () { settled = true; resolve(auth.currentUser); })
        .catch(function (e) { settled = true; console.warn('[uncoach] 익명 로그인 실패:', e); resolve(null); });
    });
  });

  function userDoc() {
    var u = auth.currentUser;
    return u ? dbf.collection('users').doc(u.uid) : null;
  }

  window.UncoachStore = {
    getUid: function () { return auth.currentUser ? auth.currentUser.uid : null; },

    // → { state } (없으면 state: null)
    loadBlob: function () {
      return ready.then(function () {
        var ref = userDoc();
        if (!ref) throw new Error('로그인되지 않았습니다.');
        return ref.get().then(function (snap) {
          return { state: (snap.exists && snap.data() && snap.data().state) || null };
        });
      });
    },

    // state = { profile, history, assets, customSits }
    saveBlob: function (state) {
      return ready.then(function () {
        var ref = userDoc();
        if (!ref) throw new Error('로그인되지 않았습니다.');
        return ref.set({
          state: state,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });
    },
  };
})();
