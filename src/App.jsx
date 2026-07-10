import { useMemo, useState } from "react";
import "./App.css";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const storageLabels = { all: "전체", fridge: "냉장", freezer: "냉동", pantry: "실온" };
const categoryOptions = ["단백질", "채소", "주식", "소스/양념", "간편식"];
const mainTabs = [
  ["fridge", "내 냉장고"],
  ["recommend", "식단 추천"],
  ["recipe", "레시피 상세"],
  ["shopping", "구매 추천"],
];
const recommendTabs = [
  ["balanced", "종합 추천"],
  ["quick", "빠른 조리"],
  ["urgent", "임박 재료 우선"],
  ["nutrition", "영양 균형"],
];

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getDday(expiry) {
  const today = new Date();
  const target = new Date(`${expiry}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / MS_PER_DAY);
}

function formatDday(days) {
  if (days < 0) return `D+${Math.abs(days)}`;
  if (days === 0) return "D-Day";
  return `D-${days}`;
}

const initialIngredients = [
  { id: 1, name: "계란", quantity: "6개", expiry: addDays(10), storage: "fridge", category: "단백질" },
  { id: 2, name: "김치", quantity: "1/2통", expiry: addDays(5), storage: "fridge", category: "채소" },
  { id: 3, name: "두부", quantity: "1모", expiry: addDays(2), storage: "fridge", category: "단백질" },
  { id: 4, name: "밥", quantity: "2공기", expiry: addDays(7), storage: "freezer", category: "주식" },
  { id: 5, name: "참치캔", quantity: "2개", expiry: addDays(30), storage: "pantry", category: "간편식" },
];

const menusByFilter = {
  balanced: [
    { id: "tofu-kimchi-bowl", badge: "냉장고 활용도 높음", name: "두부 김치 덮밥", time: "15분", balance: "탄수화물 + 단백질 균형", used: ["두부", "김치", "밥", "계란"], missing: ["대파"], summary: "임박 재료인 두부를 먼저 사용하고, 김치와 밥으로 든든하게 완성하는 한 그릇 메뉴입니다.", level: "쉬움", steps: ["두부는 키친타월로 물기를 제거한 뒤 먹기 좋은 크기로 자릅니다.", "팬에 김치를 볶고 두부를 넣어 3분 정도 더 익힙니다.", "밥 위에 볶은 두부 김치를 올리고 계란프라이를 얹습니다.", "대파가 있으면 잘게 썰어 마지막에 올려 향을 더합니다."], substitutes: "대파가 없다면 양파, 부추, 김가루로 향과 식감을 보완할 수 있습니다." },
    { id: "egg-rice", badge: "아침 식사 추천", name: "계란 간장밥", time: "8분", balance: "빠른 에너지 보충", used: ["계란", "밥"], missing: ["간장", "참기름"], summary: "바쁜 날에도 바로 만들 수 있는 초간단 메뉴입니다. 재료가 적어 자취생에게 잘 맞습니다.", level: "매우 쉬움", steps: ["따뜻한 밥을 그릇에 담습니다.", "계란프라이를 반숙으로 익혀 밥 위에 올립니다.", "간장과 참기름을 넣고 골고루 비빕니다."], substitutes: "참기름이 없으면 버터나 들기름을 조금 넣어도 고소한 맛을 낼 수 있습니다." },
    { id: "kimchi-soup", badge: "따뜻한 국물", name: "김치 두부국", time: "18분", balance: "가벼운 단백질 보충", used: ["김치", "두부"], missing: ["멸치육수", "양파"], summary: "김치와 두부를 중심으로 끓이는 국물 메뉴입니다. 남은 밥과 함께 먹기 좋습니다.", level: "보통", steps: ["냄비에 김치와 물을 넣고 8분 정도 끓입니다.", "두부와 양파를 넣고 중불에서 더 끓입니다.", "간을 보고 부족하면 소금이나 국간장을 조금 추가합니다."], substitutes: "멸치육수가 없다면 물에 참치액, 다시다, 간장을 소량 넣어 감칠맛을 보완할 수 있습니다." },
  ],
  quick: [
    { id: "quick-egg-rice", badge: "최단 시간", name: "계란 간장밥", time: "8분", balance: "탄수화물 + 단백질", used: ["계란", "밥"], missing: ["간장", "참기름"], summary: "설거지와 조리 시간을 줄이고 싶을 때 가장 빠르게 만들 수 있는 메뉴입니다.", level: "매우 쉬움", steps: ["밥을 데웁니다.", "계란프라이를 만듭니다.", "간장과 참기름을 넣고 비빕니다."], substitutes: "참기름 대신 버터를 넣으면 부드러운 맛이 납니다." },
    { id: "kimchi-fried-rice", badge: "팬 하나 조리", name: "김치 볶음밥", time: "12분", balance: "든든한 한 끼", used: ["김치", "밥", "계란"], missing: ["스팸"], summary: "김치와 밥만 있어도 만들 수 있고, 계란을 올리면 포만감이 좋아집니다.", level: "쉬움", steps: ["김치를 잘게 썰어 볶습니다.", "밥을 넣고 고르게 볶습니다.", "계란프라이를 올려 마무리합니다."], substitutes: "스팸이 없다면 참치캔, 햄, 두부를 넣어도 좋습니다." },
    { id: "tofu-scramble", badge: "가벼운 식사", name: "두부 계란 스크램블", time: "10분", balance: "단백질 중심", used: ["두부", "계란"], missing: ["소금", "후추"], summary: "두부를 먼저 소비하면서 단백질을 챙길 수 있는 간단한 팬 조리 메뉴입니다.", level: "쉬움", steps: ["두부를 으깨 물기를 제거합니다.", "계란과 섞어 팬에 볶습니다.", "소금과 후추로 간합니다."], substitutes: "후추가 없다면 김가루나 깨를 뿌려 풍미를 더할 수 있습니다." },
  ],
  urgent: [
    { id: "urgent-tofu", badge: "D-2 두부 우선", name: "두부 김치 덮밥", time: "15분", balance: "단백질 + 탄수화물", used: ["두부", "김치", "밥"], missing: ["대파"], summary: "소비 권장일이 가장 가까운 두부를 중심으로 추천된 메뉴입니다.", level: "쉬움", steps: ["두부를 굽습니다.", "김치를 볶습니다.", "밥 위에 함께 올려 덮밥으로 완성합니다."], substitutes: "대파 대신 양파나 김가루를 사용해도 좋습니다." },
    { id: "urgent-soup", badge: "두부 넉넉히 사용", name: "두부 계란국", time: "14분", balance: "따뜻한 단백질 보충", used: ["두부", "계란"], missing: ["국간장", "대파"], summary: "남은 두부를 많이 넣어 빠르게 소비할 수 있는 따뜻한 국물 메뉴입니다.", level: "쉬움", steps: ["물을 끓이고 두부를 넣습니다.", "계란을 풀어 천천히 붓습니다.", "국간장으로 간합니다."], substitutes: "국간장이 없으면 소금과 간장 소량을 섞어 간을 맞춥니다." },
    { id: "urgent-pan-tofu", badge: "반찬형 추천", name: "두부 부침", time: "12분", balance: "단백질 반찬", used: ["두부", "계란"], missing: ["부침가루"], summary: "두부를 도톰하게 부쳐 밥과 김치에 곁들이기 좋은 반찬형 메뉴입니다.", level: "쉬움", steps: ["두부의 물기를 제거합니다.", "계란물을 입혀 팬에 굽습니다.", "앞뒤로 노릇하게 익힙니다."], substitutes: "부침가루가 없다면 계란물만 입혀도 충분히 부칠 수 있습니다." },
  ],
  nutrition: [
    { id: "protein-bowl", badge: "영양 균형", name: "두부 계란 비빔밥", time: "16분", balance: "탄수화물 + 단백질 + 채소", used: ["두부", "계란", "밥", "김치"], missing: ["상추", "고추장"], summary: "밥, 계란, 두부에 채소를 더해 균형 잡힌 한 끼로 구성한 메뉴입니다.", level: "쉬움", steps: ["두부와 계란을 각각 익힙니다.", "밥 위에 김치와 재료를 올립니다.", "고추장을 넣고 비빕니다."], substitutes: "상추가 없다면 깻잎, 양배추, 오이를 넣어도 좋습니다." },
    { id: "warm-soup-set", badge: "가벼운 균형식", name: "김치 두부국 정식", time: "20분", balance: "국물 + 밥 + 단백질", used: ["김치", "두부", "밥"], missing: ["양파", "버섯"], summary: "국물과 밥을 함께 구성해 부담 없는 저녁 식사로 보여주기 좋은 메뉴입니다.", level: "보통", steps: ["김치국을 먼저 끓입니다.", "두부와 채소를 넣습니다.", "밥과 함께 한 상으로 구성합니다."], substitutes: "버섯이 없다면 애호박이나 대파로 식감을 더할 수 있습니다." },
    { id: "light-scramble", badge: "저녁 추천", name: "두부 스크램블 플레이트", time: "13분", balance: "단백질 중심 가벼운 식사", used: ["두부", "계란", "김치"], missing: ["방울토마토"], summary: "탄수화물을 줄이고 싶을 때 두부와 계란을 중심으로 구성하는 메뉴입니다.", level: "쉬움", steps: ["두부와 계란을 섞어 볶습니다.", "김치를 곁들입니다.", "토마토를 추가해 산뜻하게 마무리합니다."], substitutes: "방울토마토 대신 오이, 양배추, 사과 조각을 곁들여도 좋습니다." },
  ],
};

function App() {
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [activeMainTab, setActiveMainTab] = useState("fridge");
  const [activeStorage, setActiveStorage] = useState("all");
  const [selectedFilter, setSelectedFilter] = useState("balanced");
  const [selectedMenuId, setSelectedMenuId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingIngredientId, setEditingIngredientId] = useState(null);
  const [message, setMessage] = useState("");
  const [formValues, setFormValues] = useState({ name: "", quantity: "", storage: "fridge", category: "단백질", expiry: addDays(5) });

  const visibleIngredients = useMemo(() => activeStorage === "all" ? ingredients : ingredients.filter((item) => item.storage === activeStorage), [activeStorage, ingredients]);
  const selectedMenu = useMemo(() => Object.values(menusByFilter).flat().find((menu) => menu.id === selectedMenuId) ?? null, [selectedMenuId]);
  const urgentCount = ingredients.filter((item) => getDday(item.expiry) <= 2).length;

  const flash = (text) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2200);
  };

  const resetForm = (close = false, storage = activeStorage) => {
    setFormValues({ name: "", quantity: "", storage: storage === "all" ? "fridge" : storage, category: "단백질", expiry: addDays(5) });
    setEditingIngredientId(null);
    if (close) setIsFormOpen(false);
  };

  const handleFormChange = ({ target }) => setFormValues((current) => ({ ...current, [target.name]: target.value }));

  const handleSubmitIngredient = (event) => {
    event.preventDefault();
    const name = formValues.name.trim();
    const quantity = formValues.quantity.trim();
    if (!name || !quantity || !formValues.expiry) return flash("재료명, 수량, 유통기한을 모두 입력해주세요.");
    if (ingredients.some((item) => item.name === name && item.id !== editingIngredientId)) return flash("이미 등록된 재료입니다. 수정 버튼을 사용해주세요.");

    if (editingIngredientId) {
      setIngredients((current) => current.map((item) => item.id === editingIngredientId ? { ...item, ...formValues, name, quantity } : item));
      flash("재료 정보를 수정했습니다.");
    } else {
      const nextId = Math.max(...ingredients.map((item) => item.id), 0) + 1;
      setIngredients((current) => [{ id: nextId, ...formValues, name, quantity }, ...current]);
      flash("집 재료 보드에 새 재료를 추가했습니다.");
    }
    if (activeStorage !== "all" && activeStorage !== formValues.storage) setActiveStorage(formValues.storage);
    resetForm(true, formValues.storage);
  };

  const editIngredient = (ingredient) => {
    setEditingIngredientId(ingredient.id);
    setFormValues({ name: ingredient.name, quantity: ingredient.quantity, storage: ingredient.storage, category: ingredient.category, expiry: ingredient.expiry });
    setIsFormOpen(true);
  };

  const deleteIngredient = (id) => {
    setIngredients((current) => current.filter((item) => item.id !== id));
    if (editingIngredientId === id) resetForm(true);
    flash("재료를 삭제했습니다.");
  };

  const selectMenu = (menu, openRecipe = false) => {
    setSelectedMenuId(menu.id);
    if (openRecipe) setActiveMainTab("recipe");
  };

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">오늘의 냉장고</p>
          <h1>집에 있는 재료를 정리하고 따뜻한 한 끼를 추천받아요</h1>
        </div>
        <div className="status-card"><span>오늘 우선 소비</span><strong>{urgentCount}개</strong></div>
      </section>

      <nav className="main-tabs" aria-label="주요 워크스페이스">
        {mainTabs.map(([id, label]) => <button key={id} type="button" className={`main-tab ${activeMainTab === id ? "active" : ""}`} onClick={() => setActiveMainTab(id)}>{label}</button>)}
      </nav>

      {activeMainTab === "fridge" && <FridgeWorkspace ingredients={ingredients} visibleIngredients={visibleIngredients} activeStorage={activeStorage} setActiveStorage={setActiveStorage} urgentCount={urgentCount} isFormOpen={isFormOpen} setIsFormOpen={setIsFormOpen} editingIngredientId={editingIngredientId} formValues={formValues} handleFormChange={handleFormChange} handleSubmitIngredient={handleSubmitIngredient} resetForm={resetForm} editIngredient={editIngredient} deleteIngredient={deleteIngredient} message={message} />}
      {activeMainTab === "recommend" && <RecommendWorkspace menus={menusByFilter[selectedFilter]} selectedFilter={selectedFilter} setSelectedFilter={setSelectedFilter} selectedMenuId={selectedMenuId} setSelectedMenuId={setSelectedMenuId} selectMenu={selectMenu} />}
      {activeMainTab === "recipe" && <RecipeWorkspace menu={selectedMenu} />}
      {activeMainTab === "shopping" && <ShoppingWorkspace menu={selectedMenu} />}
    </main>
  );
}

function FridgeWorkspace({ ingredients, visibleIngredients, activeStorage, setActiveStorage, urgentCount, isFormOpen, setIsFormOpen, editingIngredientId, formValues, handleFormChange, handleSubmitIngredient, resetForm, editIngredient, deleteIngredient, message }) {
  return <section className="workspace-panel ingredient-panel">
    <div className="workspace-header"><div><p className="eyebrow">Step 1</p><h2>내 냉장고 워크스페이스</h2><p>냉장고, 냉동실, 실온 보관 재료를 한 곳에 추가하고 소비 임박 재료를 먼저 확인하세요.</p></div><button className={`add-toggle ${isFormOpen ? "active" : ""}`} type="button" aria-expanded={isFormOpen} onClick={() => editingIngredientId ? resetForm(false) : setIsFormOpen(!isFormOpen)}>{isFormOpen ? "입력 닫기" : "+ 재료 추가"}</button></div>
    <div className="workspace-summary"><div className="summary-card"><span>전체 재료</span><strong>{ingredients.length}개</strong></div><div className="summary-card urgent-summary"><span>임박 재료</span><strong>{urgentCount}개</strong></div><div className="summary-card recommendation-summary"><span>오늘 추천 기준</span><strong>{urgentCount > 0 ? "임박 재료 우선" : "종합 추천"}</strong></div></div>
    <nav className="storage-tabs" aria-label="보관 위치 필터">{Object.entries(storageLabels).map(([id, label]) => <button key={id} type="button" className={`storage-tab ${activeStorage === id ? "active" : ""}`} onClick={() => { setActiveStorage(id); if (!editingIngredientId) resetForm(true, id); }}>{label}</button>)}</nav>
    {isFormOpen && <section className="form-panel"><div className="form-panel-title"><h3>{editingIngredientId ? "재료 정보 수정" : "새 재료 등록"}</h3><button type="button" onClick={() => resetForm(true)}>닫기</button></div><form className="ingredient-form" onSubmit={handleSubmitIngredient}><label className="wide-field"><span>재료명</span><input name="name" value={formValues.name} onChange={handleFormChange} placeholder="예: 두부" /></label><label><span>수량</span><input name="quantity" value={formValues.quantity} onChange={handleFormChange} placeholder="예: 1모" /></label><label><span>보관 위치</span><select name="storage" value={formValues.storage} onChange={handleFormChange}><option value="fridge">냉장</option><option value="freezer">냉동</option><option value="pantry">실온</option></select></label><label><span>카테고리</span><select name="category" value={formValues.category} onChange={handleFormChange}>{categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label><span>유통기한</span><input name="expiry" type="date" value={formValues.expiry} onChange={handleFormChange} /></label><button type="submit">{editingIngredientId ? "수정 완료" : "재료 등록"}</button></form></section>}
    <div className="form-message" role="status">{message}</div><div className="board-label-row"><span>{storageLabels[activeStorage]} 재료 보드</span><strong>{visibleIngredients.length}개</strong></div><div className="ingredient-grid">{visibleIngredients.length ? visibleIngredients.map((ingredient) => <IngredientTile key={ingredient.id} ingredient={ingredient} onEdit={editIngredient} onDelete={deleteIngredient} />) : <div className="empty-board">{storageLabels[activeStorage]} 보드에 등록된 재료가 없습니다.<br />+ 재료 추가로 집 재료를 채워보세요.</div>}</div>
  </section>;
}

function IngredientTile({ ingredient, onEdit, onDelete }) {
  const dday = getDday(ingredient.expiry);
  const isUrgent = dday <= 2;
  return <article className={`ingredient-tile ${isUrgent ? "urgent" : ""}`}><div className="tile-top"><span className="ingredient-name">{ingredient.name}</span><span className="ingredient-dday">{formatDday(dday)}</span></div><div className="tile-badges"><span className={`storage-badge ${ingredient.storage}`}>{storageLabels[ingredient.storage]}</span><span className="category-badge">{ingredient.category}</span>{isUrgent && <span className="use-first-label">먼저 사용</span>}</div><div className="tile-meta"><span>수량 <strong>{ingredient.quantity}</strong></span><span>예상 소비 권장일 <strong>{ingredient.expiry}</strong></span></div><div className="tile-actions"><button type="button" onClick={() => onEdit(ingredient)}>수정</button><button className="delete-button" type="button" onClick={() => onDelete(ingredient.id)}>삭제</button></div></article>;
}

function RecommendWorkspace({ menus, selectedFilter, setSelectedFilter, selectedMenuId, setSelectedMenuId, selectMenu }) {
  return <section className="workspace-panel recommend-panel"><div className="section-title"><div><p className="eyebrow">Step 2</p><h2>식단 추천 결과</h2></div></div><nav className="tab-list" aria-label="추천 기준">{recommendTabs.map(([id, label]) => <button key={id} type="button" className={`tab-button ${selectedFilter === id ? "active" : ""}`} onClick={() => { setSelectedFilter(id); setSelectedMenuId(null); }}>{label}</button>)}</nav><div className="menu-grid">{menus.map((menu) => <article key={menu.id} className={`menu-card ${selectedMenuId === menu.id ? "selected" : ""}`} onClick={() => selectMenu(menu)}><span className="menu-badge">{menu.badge}</span><h3>{menu.name}</h3><div className="menu-meta"><div className="meta-box"><span>조리 시간</span><strong>{menu.time}</strong></div><div className="meta-box"><span>영양 균형</span><strong>{menu.balance}</strong></div></div><span className="label">사용 재료</span><div className="ingredient-list">{menu.used.map((item) => <span className="chip" key={item}>{item}</span>)}</div><span className="label">부족 재료</span><div className="ingredient-list">{menu.missing.length ? menu.missing.map((item) => <span className="chip missing" key={item}>{item}</span>) : <span className="chip">부족 재료 없음</span>}</div><button className="recipe-button" type="button" onClick={(event) => { event.stopPropagation(); selectMenu(menu, true); }}>레시피 보기</button></article>)}</div></section>;
}

function RecipeWorkspace({ menu }) {
  if (!menu) return <section className="workspace-panel recipe-detail"><div className="empty-state"><p className="eyebrow">Step 3</p><h2>메뉴를 선택하면 레시피가 표시됩니다</h2><p>식단 추천 탭에서 메뉴 카드 또는 레시피 보기 버튼을 눌러주세요.</p></div></section>;
  return <section className="workspace-panel recipe-detail"><div className="recipe-header"><div><p className="eyebrow">레시피 상세</p><h2>{menu.name}</h2><p className="summary-text">{menu.summary}</p></div><div className="recipe-stats"><div className="stat-card"><span className="label">조리 시간</span><strong>{menu.time}</strong></div><div className="stat-card"><span className="label">난이도</span><strong>{menu.level}</strong></div></div></div><ol className="steps">{menu.steps.map((step, index) => <li key={step}><span className="step-number">{index + 1}</span><span>{step}</span></li>)}</ol>{menu.missing.length > 0 && <div className="substitute-box"><strong>대체 재료 안내</strong><br />{menu.substitutes}</div>}</section>;
}

function ShoppingWorkspace({ menu }) {
  return <section className="workspace-panel shopping-panel"><div className="section-title"><div><p className="eyebrow">Step 4</p><h2>부족 재료 구매 추천</h2></div></div>{!menu ? <div className="empty-shopping">부족 재료가 있는 메뉴를 선택하면 구매 추천 카드가 표시됩니다.</div> : menu.missing.length ? <div className="shopping-list">{menu.missing.map((item) => <div className="shopping-card" key={item}><h3>{item}</h3><p>{menu.name}에 넣으면 맛과 완성도가 올라가는 추천 구매 재료입니다.</p><button className="buy-button" type="button">더미 구매 버튼</button></div>)}</div> : <div className="empty-shopping">이 메뉴는 현재 재료만으로 만들 수 있습니다.</div>}</section>;
}

export default App;
