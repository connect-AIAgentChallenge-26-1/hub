import { ArrowLeft, Camera, ChevronRight, Heart, MapPin, Plus, Search, ShieldCheck, X } from "lucide-react";
import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CameraCapture } from "./components/CameraCapture";
import { CoordinatePicker } from "./components/CoordinatePicker";
import { NaverMap } from "./components/NaverMap";
import { photoSpots, shotFrames } from "./data/photoSpots";
import { createCandidateSpot, fetchCandidateSpots, fetchOfficialSpots, fetchSpotFrames, searchPlaces, type PlaceSearchResult } from "./services/photoNavigationApi";
import { compareCapturedComposition, type CompositionComparison, type ComparisonMode } from "./services/compositionComparison";
import { analyzeProposalLayout } from "./services/proposalLayoutAnalysis";
import { geocodeAddress } from "./services/naverMaps";
import type { PhotoSpot, ProposalDraft, ShotFrame, SpotKind } from "./types/photoSpot";
import "./styles/app.css";

type View = "map" | "detail" | "frames" | "camera" | "capture" | "proposal" | "complete";

const emptyProposalDraft = (): ProposalDraft => ({
  latitude: 35.8547,
  longitude: 128.5663,
  address: "현재 위치를 불러오는 중이에요.",
  spotName: "",
  frame: "couple",
  imageName: null,
});

function createCandidateFallbackFrames(spot: PhotoSpot): ShotFrame[] {
  return shotFrames.map((frame) => {
    const personFrames = frame.people === "couple"
      ? [{ personIndex: 0, x: 0.29, y: 0.39, width: 0.18, height: 0.37 }, { personIndex: 1, x: 0.53, y: 0.39, width: 0.18, height: 0.37 }]
      : [{ personIndex: 0, x: 0.39, y: 0.34, width: 0.23, height: 0.48 }];

    return {
      ...frame,
      id: `${spot.id}--fallback--${frame.id}`,
      title: frame.id === "solo-center" ? "1인 기본 구도" : frame.id === "couple-walk" ? "커플 자연스러운 포즈" : "커플 기본 구도",
      tone: spot.imageTone,
      subtitle: `${frame.people === "couple" ? "커플" : "1인"} · 기본 가이드`,
      guide: spot.placeTip,
      referenceImageUrl: spot.thumbnailImageUrl ?? frame.referenceImageUrl,
      poseGuide: {
        personFrames,
        personPoses: [],
        personOutlines: [],
      },
    };
  });
}

function resolveSpotFrames(spot: PhotoSpot | undefined, loadedFrames: Record<string, ShotFrame[]>): ShotFrame[] {
  if (!spot) return [];
  if (loadedFrames[spot.id]?.length) return loadedFrames[spot.id];
  if (spot.kind === "official") return loadedFrames[spot.id] ?? [];
  return spot.frames?.length ? spot.frames : createCandidateFallbackFrames(spot);
}

const isPersistedSpotId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function App() {
  if (new URLSearchParams(window.location.search).get("setup") === "coordinates") {
    return <CoordinatePicker />;
  }

  const [view, setView] = useState<View>("map");
  const [mode, setMode] = useState<SpotKind>("official");
  const [spots, setSpots] = useState(photoSpots);
  const [selectedId, setSelectedId] = useState(photoSpots[0].id);
  const [selectedFrame, setSelectedFrame] = useState<ShotFrame>(shotFrames[0]);
  const [framesBySpot, setFramesBySpot] = useState<Record<string, ShotFrame[]>>({});
  const [spotDataState, setSpotDataState] = useState<"loading" | "ready" | "error">("loading");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraOrientation, setCameraOrientation] = useState<"portrait" | "landscape">("portrait");
  const [liked, setLiked] = useState<string[]>([]);
  const [draft, setDraft] = useState<ProposalDraft>(emptyProposalDraft);
  const [proposalImage, setProposalImage] = useState<File | null>(null);
  const [proposalLayout, setProposalLayout] = useState<ShotFrame["poseGuide"]>();
  const [proposalAnalysisState, setProposalAnalysisState] = useState<"idle" | "analyzing" | "ready" | "error">("idle");
  const [proposalAnalysisError, setProposalAnalysisError] = useState<string | null>(null);
  const [proposalSubmissionError, setProposalSubmissionError] = useState<string | null>(null);
  const [isProposalSubmitting, setIsProposalSubmitting] = useState(false);
  const visibleSpots = useMemo(() => spots.filter((spot) => spot.kind === mode), [mode, spots]);
  const selectedSpot = spots.find((spot) => spot.id === selectedId) ?? visibleSpots[0];

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchOfficialSpots(), fetchCandidateSpots()])
      .then(([officialSpots, databaseCandidates]) => {
        if (cancelled) return;
        const localCandidates = photoSpots.filter((spot) => spot.kind === "candidate");
        const databaseIds = new Set(databaseCandidates.map((spot) => spot.id));
        setSpots([...officialSpots, ...databaseCandidates, ...localCandidates.filter((spot) => !databaseIds.has(spot.id))]);
        setSelectedId((current) => officialSpots.some((spot) => spot.id === current) ? current : officialSpots[0]?.id ?? current);
        setSpotDataState("ready");
      })
      .catch(() => {
        if (!cancelled) setSpotDataState("error");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedSpot || (selectedSpot.kind === "candidate" && !isPersistedSpotId(selectedSpot.id))) return;
    let cancelled = false;
    void fetchSpotFrames(selectedSpot.id)
      .then((frames) => {
        if (cancelled) return;
        setFramesBySpot((current) => ({ ...current, [selectedSpot.id]: frames }));
        if (frames[0]) setSelectedFrame(frames[0]);
      })
      .catch(() => {
        // The map remains usable even while a single spot's frames fail to load.
      });
    return () => { cancelled = true; };
  }, [selectedSpot?.id, selectedSpot?.kind]);

  const selectedFrames = useMemo(
    () => resolveSpotFrames(selectedSpot, framesBySpot),
    [selectedSpot, framesBySpot],
  );
  const activeFrame = selectedFrames.find((frame) => frame.id === selectedFrame.id) ?? selectedFrames[0] ?? selectedFrame;

  useEffect(() => {
    if (selectedFrames.length > 0 && !selectedFrames.some((frame) => frame.id === selectedFrame.id)) {
      setSelectedFrame(selectedFrames[0]);
    }
  }, [selectedFrames, selectedFrame.id]);

  const selectSpot = (spot: PhotoSpot) => { setSelectedId(spot.id); setMode(spot.kind); };
  const toggleLike = () => {
    if (!selectedSpot || selectedSpot.kind !== "candidate") return;
    const hasLiked = liked.includes(selectedSpot.id);
    setLiked((current) => hasLiked ? current.filter((id) => id !== selectedSpot.id) : [...current, selectedSpot.id]);
    setSpots((current) => current.map((spot) => spot.id === selectedSpot.id ? { ...spot, likes: (spot.likes ?? 0) + (hasLiked ? -1 : 1) } : spot));
  };
  const selectProposalCoordinate = ({ latitude, longitude }: { latitude: number; longitude: number }) => setDraft((current) => ({ ...current, latitude, longitude, address: `선택한 촬영 위치 (${latitude.toFixed(5)}, ${longitude.toFixed(5)})` }));
  const selectProposalPlace = ({ latitude, longitude, address }: { latitude: number; longitude: number; address: string }) => setDraft((current) => ({ ...current, latitude, longitude, address }));
  const analyzeProposalImage = async (file: File, frameType: "solo" | "couple") => {
    setProposalAnalysisState("analyzing");
    setProposalAnalysisError(null);
    try {
      setProposalLayout(await analyzeProposalLayout(file, frameType));
      setProposalAnalysisState("ready");
    } catch (error) {
      setProposalLayout(undefined);
      setProposalAnalysisState("error");
      setProposalAnalysisError(error instanceof Error ? error.message : "레이아웃 분석을 완료하지 못했어요.");
    }
  };
  const receiveImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setProposalImage(file);
    setDraft((current) => ({ ...current, imageName: file.name }));
    void analyzeProposalImage(file, draft.frame);
  };
  const changeProposalFrame = (frame: "solo" | "couple") => {
    setDraft((current) => ({ ...current, frame }));
    if (proposalImage) void analyzeProposalImage(proposalImage, frame);
  };
  const resetProposal = () => {
    setDraft(emptyProposalDraft());
    setProposalImage(null);
    setProposalLayout(undefined);
    setProposalAnalysisState("idle");
    setProposalAnalysisError(null);
    setProposalSubmissionError(null);
    setIsProposalSubmitting(false);
  };
  const openProposal = (spot?: PhotoSpot) => {
    resetProposal();
    if (spot) setDraft({ ...emptyProposalDraft(), latitude: spot.latitude, longitude: spot.longitude, address: spot.address });
    setView("proposal");
  };
  const submitProposal = async () => {
    if (!proposalImage || !proposalLayout || isProposalSubmitting) return;
    setProposalSubmissionError(null);
    setIsProposalSubmitting(true);
    try {
      const created = await createCandidateSpot({
        spotName: draft.spotName,
        address: draft.address,
        latitude: draft.latitude,
        longitude: draft.longitude,
        frameType: draft.frame,
        image: proposalImage,
        poseGuide: proposalLayout,
      });
      setSpots((current) => [...current.filter((spot) => spot.id !== created.spot.id), created.spot]);
      setFramesBySpot((current) => ({ ...current, [created.spot.id]: created.frames }));
      setSelectedId(created.spot.id);
      setMode("candidate");
      if (created.frames[0]) setSelectedFrame(created.frames[0]);
      resetProposal();
      setView("map");
    } catch (error) {
      setProposalSubmissionError(error instanceof Error ? error.message : "후보 포토스팟을 등록하지 못했어요.");
      setIsProposalSubmitting(false);
    }
  };

  return <main className="app-shell"><section className={`phone-frame ${view === "camera" && cameraOrientation === "landscape" ? "camera-landscape" : ""}`}>
    <div className="status-bar"><span>9:41</span><span>● ● ● 〰 ▰</span></div>
    <div hidden={view !== "map"}>
      <MapScreen mapActive={view === "map"} mode={mode} spots={spots} visibleSpots={visibleSpots} selectedSpot={selectedSpot} dataState={spotDataState} onMode={setMode} onSelect={selectSpot} onDetail={() => setView("detail")} onPropose={openProposal} />
    </div>
    {view === "detail" && selectedSpot && <DetailScreen spot={selectedSpot} heroImageUrl={selectedFrames[0]?.referenceImageUrl} liked={liked.includes(selectedSpot.id)} onBack={() => setView("map")} onLike={toggleLike} onFrames={() => setView("frames")} onPropose={() => openProposal(selectedSpot)} />}
    {view === "frames" && selectedSpot && <FrameScreen spot={selectedSpot} frames={selectedFrames} selected={activeFrame} onBack={() => setView("detail")} onSelect={(frame) => { setSelectedFrame(frame); setCameraOrientation(frame.poseGuide?.orientation ?? "portrait"); setView("camera"); }} />}
    {view === "camera" && <CameraCapture frame={activeFrame} onOrientationChange={setCameraOrientation} onBack={() => { setCameraOrientation("portrait"); setView("frames"); }} onCapture={(image) => { setCapturedImage(image); setCameraOrientation("portrait"); setView("capture"); }} />}
    {view === "capture" && <CaptureReview image={capturedImage} frame={activeFrame} onRetake={() => setView("camera")} onMap={() => setView("map")} />}
    {view === "proposal" && <ProposalScreen draft={draft} analysisState={proposalAnalysisState} analysisError={proposalAnalysisError} submissionError={proposalSubmissionError} submitting={isProposalSubmitting} layout={proposalLayout} onBack={() => { resetProposal(); setView("map"); }} onCoordinateSelect={selectProposalCoordinate} onPlaceSelect={selectProposalPlace} onSpotNameChange={(spotName) => setDraft((current) => ({ ...current, spotName }))} onImageSelect={receiveImage} onFrameChange={changeProposalFrame} onRetryAnalysis={() => { if (proposalImage) void analyzeProposalImage(proposalImage, draft.frame); }} onSubmit={() => void submitProposal()} />}
    {view === "complete" && <CompleteScreen onMap={() => setView("map")} />}
  </section></main>;
}

function MapScreen({ mapActive, mode, spots, visibleSpots, selectedSpot, dataState, onMode, onSelect, onDetail, onPropose }: { mapActive: boolean; mode: SpotKind; spots: PhotoSpot[]; visibleSpots: PhotoSpot[]; selectedSpot?: PhotoSpot; dataState: "loading" | "ready" | "error"; onMode: (mode: SpotKind) => void; onSelect: (spot: PhotoSpot) => void; onDetail: () => void; onPropose: () => void }) {
  const [query, setQuery] = useState("");
  const [searchFocusKey, setSearchFocusKey] = useState(0);
  const [markerSelectionKey, setMarkerSelectionKey] = useState(0);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const searchResults = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return spots.filter((spot) => [spot.name, spot.area, spot.address, spot.placeCategory].some((value) => value.toLowerCase().includes(keyword)));
  }, [query, spots]);
  useEffect(() => {
    if (mode === "candidate" && selectedSpot?.kind === "candidate") setSheetExpanded(true);
  }, [mode, selectedSpot?.id, selectedSpot?.kind]);
  const setTab = (next: SpotKind) => { onMode(next); onSelect(spots.find((spot) => spot.kind === next)!); };
  const selectSearchResult = (spot: PhotoSpot) => { onSelect(spot); setQuery(spot.name); setSearchFocusKey((current) => current + 1); };
  const submitSearch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (searchResults[0]) selectSearchResult(searchResults[0]); };
  return <><header className="map-header"><form className="search-form" onSubmit={submitSearch}><label className="search-box"><Search size={21} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="장소 검색" aria-label="장소 검색" /><button type="submit" aria-label="검색">검색</button></label>{searchResults.length > 0 && <div className="search-results">{searchResults.map((spot) => <button type="button" key={spot.id} onClick={() => selectSearchResult(spot)}><span><b>{spot.name}</b><small>{spot.placeCategory} · {spot.address}</small></span><MapPin size={17} /></button>)}</div>}</form></header>{dataState !== "ready" && <p className="data-status">{dataState === "loading" ? "공식 포토스팟을 불러오는 중이에요." : "DB 연결에 실패해 임시 데이터를 보여주고 있어요."}</p>}<NaverMap spots={visibleSpots} selectedId={selectedSpot?.id} focusKey={searchFocusKey} sheetExpanded={sheetExpanded} mode={mode} isActive={mapActive} onSelect={(spot) => { onSelect(spot); setMarkerSelectionKey((current) => current + 1); }} /><BottomSheet mode={mode} spots={visibleSpots} candidateCount={spots.filter((spot) => spot.kind === "candidate").length} selectedId={selectedSpot?.id} selectionKey={markerSelectionKey} expanded={sheetExpanded} onExpandedChange={setSheetExpanded} onTab={setTab} onSelect={onSelect} onDetail={onDetail} onPropose={onPropose} /></>;
}

function BottomSheet({ mode, spots, candidateCount, selectedId, selectionKey, expanded, onExpandedChange, onTab, onSelect, onDetail, onPropose }: { mode: SpotKind; spots: PhotoSpot[]; candidateCount: number; selectedId?: string; selectionKey: number; expanded: boolean; onExpandedChange: (expanded: boolean) => void; onTab: (mode: SpotKind) => void; onSelect: (spot: PhotoSpot) => void; onDetail: () => void; onPropose: () => void }) {
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const selectTab = (next: SpotKind) => { onTab(next); onExpandedChange(true); };
  useEffect(() => {
    if (selectionKey === 0) return;
    onExpandedChange(true);
    requestAnimationFrame(() => selectedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }, [selectionKey, selectedId, onExpandedChange]);
  const selectRow = (spot: PhotoSpot) => {
    if (spot.id === selectedId) onDetail();
    else { onSelect(spot); onExpandedChange(true); }
  };
  return <section className={`bottom-sheet ${expanded ? "expanded" : ""}`}><button className="sheet-handle" type="button" aria-label={expanded ? "목록 접기" : "목록 펼치기"} aria-expanded={expanded} onClick={() => onExpandedChange(!expanded)} /><div className="sheet-tabs" role="tablist" aria-label="포토스팟 목록"><button className={`sheet-tab ${mode === "official" ? "active" : ""}`} type="button" role="tab" aria-selected={mode === "official"} onClick={() => selectTab("official")}>공식</button><button className={`sheet-tab ${mode === "candidate" ? "active" : ""}`} type="button" role="tab" aria-selected={mode === "candidate"} onClick={() => selectTab("candidate")}>후보 {candidateCount}</button><button className="proposal-button" type="button" onClick={onPropose}><Plus size={16} /> 후보 제안</button></div><div className="spot-list">{spots.map((spot) => <button ref={spot.id === selectedId ? selectedRowRef : undefined} className={`spot-row ${spot.id === selectedId ? "selected" : ""}`} type="button" key={spot.id} onClick={() => selectRow(spot)}><PhotoThumbnail tone={spot.imageTone} imageUrl={spot.thumbnailImageUrl} /><span className="spot-row-copy"><strong>{spot.name}</strong><small>{spot.area}</small>{spot.kind === "candidate" && <em><Heart size={14} fill="currentColor" /> {spot.likes} / {spot.threshold}</em>}</span><ChevronRight size={23} /></button>)}</div></section>;
}

function DetailScreen({ spot, heroImageUrl, liked, onBack, onLike, onFrames, onPropose }: { spot: PhotoSpot; heroImageUrl?: string | null; liked: boolean; onBack: () => void; onLike: () => void; onFrames: () => void; onPropose: () => void }) { const imageUrl = heroImageUrl ?? spot.thumbnailImageUrl; return <section className="detail-screen"><header className="page-header"><button type="button" onClick={onBack} aria-label="뒤로"><ArrowLeft size={24} /></button><strong>{spot.kind === "candidate" ? "후보 포토스팟" : "공식 포토스팟"}</strong><button type="button" onClick={onBack} aria-label="닫기"><X size={22} /></button></header><PhotoThumbnail tone={spot.imageTone} imageUrl={imageUrl} large /><article className="detail-card"><div className="title-row"><div><h2>{spot.name}</h2><p>{spot.placeCategory}</p></div>{spot.kind === "candidate" && <button className={`like-button ${liked ? "liked" : ""}`} type="button" onClick={onLike}><Heart size={20} fill={liked ? "currentColor" : "none"} /> {spot.likes}</button>}</div>{spot.kind === "candidate" && <div className="threshold-box"><b>좋아요 {spot.likes} / {spot.threshold}</b><span>좋아요 10개 달성 후 관리자 검토를 거쳐 공식 포토스팟으로 등록됩니다.</span></div>}<Info label="장소" text={spot.address} icon={<MapPin size={20} />} /><Info label="촬영 팁" text={spot.placeTip} icon={<Camera size={20} />} /><Info label="포토스팟 안내" text={spot.description} icon={<ChevronRight size={20} />} /><button className="primary-cta" type="button" onClick={onFrames}>프레임 고르고 사진 찍기 <Camera size={19} /></button><button className="text-cta" type="button" onClick={onPropose}>이 장소를 후보로 제안하기</button></article></section>; }

function FrameScreen({ spot, frames, selected, onBack, onSelect }: { spot: PhotoSpot; frames: ShotFrame[]; selected: ShotFrame; onBack: () => void; onSelect: (frame: ShotFrame) => void }) { return <section className="frame-screen"><header className="page-header"><button type="button" onClick={onBack} aria-label="뒤로"><ArrowLeft size={24} /></button><div><strong>프레임 선택</strong><small>{spot.name}</small></div><span /></header><p className="screen-intro">원하는 구도를 고르면 바로 카메라 오버레이로 이어집니다.</p><div className="frame-list">{frames.length > 0 ? frames.map((frame) => <button key={frame.id} className={`frame-card ${selected.id === frame.id ? "selected" : ""}`} type="button" onClick={() => onSelect(frame)}><PhotoThumbnail tone={frame.tone} imageUrl={frame.referenceImageUrl} /><span><b>{frame.title}</b><small>{frame.subtitle}</small><em>{frame.guide}</em></span><ChevronRight size={22} /></button>) : <p className="frame-empty">승인된 프레임을 불러오는 중이거나 아직 등록되지 않았어요.</p>}</div></section>; }

function CaptureReview({ image, frame, onRetake, onMap }: { image: string | null; frame: ShotFrame; onRetake: () => void; onMap: () => void }) {
  const [analysisState, setAnalysisState] = useState<"idle" | "analyzing" | "done" | "error">("idle");
  const [comparison, setComparison] = useState<CompositionComparison | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<ComparisonMode>("fast");

  const runComparison = async (comparisonMode: ComparisonMode) => {
    if (!image) return;
    setAnalysisState("analyzing");
    setErrorMessage(null);
    setMode(comparisonMode);
    try {
      const result = await compareCapturedComposition({ image, frame, mode: comparisonMode });
      setComparison(result);
      setAnalysisState("done");
    } catch (error) {
      setComparison(null);
      setAnalysisState("error");
      setErrorMessage(error instanceof Error ? error.message : "구도 비교 중 문제가 생겼어요.");
    }
  };

  useEffect(() => {
    if (image) void runComparison("fast");
  }, [image, frame.id]);

  const score = comparison?.compositionScore ?? null;
  return <section className="capture-review"><header className="page-header"><span /><strong>촬영 결과</strong><span /></header><div className="captured-image">{image ? <img src={image} alt="방금 촬영한 사진" /> : <PhotoThumbnail tone={frame.tone} large />}</div><article><div className="capture-title"><div><b>{frame.title}</b><p>예시 사진의 인물 배치와 비교한 결과입니다.</p></div><span className={`analysis-badge ${analysisState}`}>{analysisState === "analyzing" ? "분석 중" : mode === "accurate" ? "정확 비교" : "빠른 비교"}</span></div>{analysisState === "analyzing" && <div className="analysis-loading"><i /><div><b>인물 구도를 분석하고 있어요</b><span>촬영 사진만 새로 분석합니다.</span></div></div>}{analysisState === "done" && comparison && <div className={`comparison-result ${comparison.status}`}><div className="score-row"><div><small>구도 유사도</small><strong>{score === null ? "-" : score.toFixed(1)}<em>/ 100</em></strong></div><span>{comparison.scoringMode === "yolo_pose_and_background" ? "인물 + 배경선" : "인물 배치"}</span></div>{comparison.status === "limited" ? <p className="analysis-message">인물 또는 배경 정보를 충분히 확인하지 못했어요. 오버레이를 참고해 다시 촬영해 보세요.</p> : <><div className="score-summary"><span>인물 <b>{comparison.person.score?.toFixed(1) ?? "-"}</b></span>{mode === "accurate" && <span>배경선 <b>{comparison.background.score?.toFixed(1) ?? "-"}</b></span>}</div><ul className="analysis-feedback">{comparison.feedback.map((feedback) => <li key={feedback}>{feedback}</li>)}</ul></>}</div>}{analysisState === "error" && <div className="analysis-error"><b>구도 분석을 완료하지 못했어요.</b><span>{errorMessage}</span></div>}<div className="comparison-actions"><button className="outline-cta" type="button" disabled={analysisState === "analyzing" || !image} onClick={() => void runComparison("fast")}>빠른 비교 다시하기</button><button className="outline-cta" type="button" disabled={analysisState === "analyzing" || !image || !frame.referenceImageUrl} onClick={() => void runComparison("accurate")}>배경선까지 정확 비교</button></div>{image && <a className="outline-cta capture-download" href={image} download={`photo-navigation-${frame.id}.png`}>사진 다운로드</a>}<button className="primary-cta" type="button" onClick={onRetake}>다시 찍기</button><button className="text-cta" type="button" onClick={onMap}>지도 보기</button></article></section>;
}

function ProposalScreen({ draft, analysisState, analysisError, submissionError, submitting, layout, onBack, onCoordinateSelect, onPlaceSelect, onSpotNameChange, onImageSelect, onFrameChange, onRetryAnalysis, onSubmit }: { draft: ProposalDraft; analysisState: "idle" | "analyzing" | "ready" | "error"; analysisError: string | null; submissionError: string | null; submitting: boolean; layout?: ShotFrame["poseGuide"]; onBack: () => void; onCoordinateSelect: (coordinate: { latitude: number; longitude: number }) => void; onPlaceSelect: (place: { latitude: number; longitude: number; address: string }) => void; onSpotNameChange: (name: string) => void; onImageSelect: (event: ChangeEvent<HTMLInputElement>) => void; onFrameChange: (frame: "solo" | "couple") => void; onRetryAnalysis: () => void; onSubmit: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "searching" | "error">("idle");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const canSubmit = Boolean(draft.spotName.trim() && draft.imageName && analysisState === "ready" && layout);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const keyword = query.trim();
    if (keyword.length < 2) {
      setSearchMessage("두 글자 이상 입력해 주세요.");
      return;
    }
    setSearchState("searching");
    setSearchMessage(null);
    try {
      const items = await searchPlaces(keyword);
      setResults(items);
      setSearchState("idle");
      if (items.length === 0) setSearchMessage("검색 결과가 없어요. 주소를 더 구체적으로 입력해 주세요.");
    } catch (error) {
      setResults([]);
      setSearchState("error");
      setSearchMessage(error instanceof Error ? error.message : "장소를 검색하지 못했어요.");
    }
  };

  const selectPlace = async (place: PlaceSearchResult) => {
    setSearchState("searching");
    setSearchMessage("선택한 장소로 이동하고 있어요.");
    try {
      const coordinate = await geocodeAddress(place.address);
      onPlaceSelect({ ...coordinate, address: place.address });
      if (!draft.spotName.trim()) onSpotNameChange(place.name);
      setQuery(place.name);
      setResults([]);
      setSearchState("idle");
      setSearchMessage("장소 중심으로 이동했어요. 실제 촬영 지점을 지도에서 한 번 더 눌러 조정하세요.");
    } catch {
      setSearchState("error");
      setSearchMessage("선택한 장소의 좌표를 찾지 못했어요. 지도를 직접 눌러 촬영 지점을 선택해 주세요.");
    }
  };

  return <section className="proposal-screen"><header className="page-header"><button type="button" onClick={onBack} aria-label="뒤로"><ArrowLeft size={24} /></button><strong>후보 제안</strong><span /></header><div className="proposal-map"><NaverMap spots={[]} mode="candidate" hasBottomSheet={false} selectable locateOnMount selectedCoordinate={draft} onSelect={() => undefined} onCoordinateSelect={onCoordinateSelect} /><form className="proposal-search" onSubmit={search}><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="장소 또는 주소 검색" aria-label="후보 장소 검색" /><button type="submit" disabled={searchState === "searching"}>검색</button></label>{results.length > 0 && <div className="proposal-search-results">{results.map((place) => <button type="button" key={`${place.name}-${place.address}`} onClick={() => void selectPlace(place)}><span><b>{place.name}</b><small>{place.category || "장소"} · {place.address}</small></span><MapPin size={17} /></button>)}</div>}</form><div className="map-tip">검색 후 실제 촬영 지점을 눌러 조정하세요</div></div><div className="proposal-form">{searchMessage && <p className={`proposal-search-message ${searchState}`}>{searchMessage}</p>}{submissionError && <p className="proposal-search-message error">{submissionError}</p>}<label>선택한 위치 <span>{draft.address}</span></label><label className="proposer-field">제안 포토스팟 이름 <input value={draft.spotName} onChange={(event) => onSpotNameChange(event.target.value)} placeholder="예: 노을이 보이는 벤치" maxLength={40} /></label><label className="upload-box"><input type="file" accept="image/*" onChange={onImageSelect} /><Camera size={24} /><b>{draft.imageName ?? "사진 추가"}</b><small>{draft.imageName ? "사진 1장이 선택되었습니다" : "사진은 1장만 등록할 수 있어요"}</small></label>{analysisState !== "idle" && <div className={`proposal-analysis ${analysisState}`}>{analysisState === "analyzing" ? "YOLO Pose와 SAM2로 인물 레이아웃을 분석하고 있어요." : analysisState === "ready" ? `레이아웃 분석 완료 · 인물 ${layout?.personFrames.length ?? 0}명 가이드가 등록됩니다.` : <><span>{analysisError}</span><button type="button" onClick={onRetryAnalysis}>레이아웃 분석 다시 시도</button></>}</div>}<div className="field-label">프레임 선택</div><div className="frame-segment"><button type="button" className={draft.frame === "solo" ? "active" : ""} onClick={() => onFrameChange("solo")}>1인</button><button type="button" className={draft.frame === "couple" ? "active" : ""} onClick={() => onFrameChange("couple")}>커플</button></div><button className="primary-cta" type="button" disabled={!canSubmit || submitting} onClick={onSubmit}>{submitting ? "후보 등록 중..." : "후보 제안 제출"}</button></div></section>; 
}

function CompleteScreen({ onMap }: { onMap: () => void }) { return <section className="complete-screen"><MapPin className="heart-badge" size={47} fill="currentColor" /><h1>후보 제안이 제출되었습니다</h1><p>좋아요 10개 달성 시 관리자 검토 후 공식 포토스팟으로 등록됩니다.</p><div className="vertical-flow"><div><Heart size={29} fill="currentColor" /><b>좋아요 10개 달성</b></div><i>↓</i><div><ShieldCheck size={42} /><b>관리자 검토</b><span>사진, 촬영 위치, 레이아웃을 확인합니다.</span></div><i>↓</i><div><MapPin size={42} fill="currentColor" /><b>DB 등록</b><span>승인된 후보와 레이아웃을 DB에 추가합니다.</span></div><i>↓</i><div><MapPin size={42} fill="currentColor" /><b>공식 지도 노출</b><span>공식 포토스팟 마커로 지도에 표시됩니다.</span></div></div><small>※ AI 자동 승인이 아닌 관리자 직접 검토입니다.</small><button className="primary-cta" type="button" onClick={onMap}>지도 보기</button></section>; }

function PhotoThumbnail({ tone, imageUrl, large = false }: { tone: PhotoSpot["imageTone"]; imageUrl?: string | null; large?: boolean }) { return <div className={`photo-thumb ${tone} ${large ? "large" : ""}`}>{imageUrl ? <img src={imageUrl} alt="포토스팟 예시 사진" /> : <><div className="photo-sky" /><div className="photo-ground" /><div className="photo-subject one" /><div className="photo-subject two" /></>}</div>; }
function Info({ label, text, icon }: { label: string; text: string; icon: ReactNode }) { return <div className="info-row"><span>{icon}</span><div><b>{label}</b><p>{text}</p></div></div>; }

createRoot(document.getElementById("root")!).render(<App />);
