import type { AgentChatResult } from "../utils/agentChat";

interface DocAgentScript {
  // Scripted agent replies, one per turn, in the order they're sent —
  // matches the real Agent's questionCount indexing (number of prior agent
  // messages in the conversation).
  turns: string[];
  // Full document returned once every scripted turn has been answered.
  document: string;
}

// One consistent storyline runs across every Step's script (2D dodge-roguelike,
// dash/melee/ranged, cursed-castle setting) — the same concept already used
// in this project's own Day 11-14 E2E test runs, so a full demo walkthrough
// reads as one coherent game rather than 9 unrelated snippets.

const REQUIREMENTS_DOCUMENT = `# Requirements

## Core Gameplay
- [ ] 2D 로그라이크 액션 장르
- [ ] PC 플랫폼 및 키보드/마우스 조작
- [ ] WASD 키를 이용한 8방향 이동
- [ ] 마우스 커서 방향으로 대시 이동
- [ ] 마우스 좌클릭 근접 검 공격
- [ ] 마우스 우클릭 원거리 투척 무기 공격

## UI
- [ ] 메인 메뉴 화면
- [ ] 인게임 HUD (플레이어 체력 및 골드 표시)
- [ ] 게임오버 화면

## Out of Scope
- [ ] 멀티플레이어 및 코옵 기능 (싱글플레이어 전용)`;

const GAME_DESIGN_DOCUMENT = `# Game Design

## Core Gameplay
- [ ] 대시 이동 시 무적 프레임 적용
- [ ] 무적 프레임 지속 시간은 대시 지속 시간과 동일하게 설정
- [ ] 대시 중 피격 판정은 데미지만 무시 (넉백은 그대로 적용)
- [ ] 대시 쿨다운 1.2초

## World & Story
- [ ] 저주받은 성을 배경으로 한 로그라이크 던전 탐험

## Characters
- [ ] 이름 없는 검객 — 근접 공격과 대시를 활용하는 플레이어 캐릭터`;

const SYSTEM_DESIGN_DOCUMENT = `# System Design

## Core Mechanics Rules
- [ ] 대시 쿨다운 1.2초, 대시 중 0.3초간 무적
- [ ] 대시 중에는 공격 입력을 받지 않음
- [ ] 근접 공격은 즉시 판정, 원거리 공격은 투사체 발사
- [ ] 피격 시 체력 1 감소 및 넉백 적용
- [ ] 골드는 몬스터 처치 시 획득, 상점에서 아이템 구매에 사용

## Data Flow
- [ ] PlayerController가 입력을 받아 DashComponent/HealthComponent에 위임
- [ ] Enemy가 피격 처리 시 GameManager에 골드 지급 이벤트를 전달`;

const CLASS_DESIGN_DOCUMENT = `# Class Design

## Classes
- [ ] PlayerController — 입력 처리, DashComponent/HealthComponent 보유
- [ ] DashComponent — 대시 이동·무적 프레임·쿨다운 관리, IDashable 구현
- [ ] HealthComponent — 체력, 피격, 넉백 처리
- [ ] BaseEnemy — 몬스터 공통 로직을 담는 추상 클래스
- [ ] MeleeEnemy — BaseEnemy 상속, 근접 공격
- [ ] RangedEnemy — BaseEnemy 상속, 투사체 공격
- [ ] ItemData — ScriptableObject 기반 아이템 데이터, IItemEffect 조합

## Relationships
- [ ] PlayerController는 IDashable을 구현한다
- [ ] MeleeEnemy, RangedEnemy는 BaseEnemy를 상속한다
- [ ] ItemData는 IItemEffect 구현체를 조합해서 효과를 구성한다`;

const PROJECT_STRUCTURE_DOCUMENT = `# Project Structure

## Folder Structure
- [ ] Assets/Scripts/Core/ — 공용 인터페이스 (IDashable, IItemEffect 등)
- [ ] Assets/Scripts/Player/ — 플레이어 관련 클래스
- [ ] Assets/Scripts/Enemy/ — 몬스터 관련 클래스
- [ ] Assets/Scripts/Item/ — 아이템/인벤토리 관련 클래스
- [ ] Assets/Scripts/UI/ — HUD, 메뉴 관련 클래스

## Assembly Definitions
- [ ] Core.asmdef — 다른 모든 어셈블리가 참조하는 공용 인터페이스
- [ ] Player.asmdef — Core 참조
- [ ] Enemy.asmdef — Core, Player 참조
- [ ] Item.asmdef — Core 참조`;

const SCRIPTABLE_OBJECT_DOCUMENT = `# ScriptableObjects

## Data Assets
- [ ] PlayerData — 최대 체력, 이동 속도
- [ ] DashData — 무적 지속 시간, 쿨다운, 대시 속도
- [ ] EnemyData — 몬스터 체력, 공격력, 이동 속도
- [ ] ItemData — 아이템 이름, 아이콘, 효과 목록`;

const DOCUMENTATION_DOCUMENT = `# Documentation

## Requirements Summary
- [ ] 2D 로그라이크 액션 게임, PC 플랫폼, WASD 이동 + 대시 + 근접/원거리 공격

## Game Design Summary
- [ ] 저주받은 성을 배경으로 한 로그라이크 던전 탐험, 대시 무적 프레임 적용

## System Design Summary
- [ ] 대시 쿨다운 1.2초, 피격 시 넉백/체력 감소, 골드 기반 아이템 구매

## Code Changes Summary
- [ ] IDashable.cs 추가 — 대시 가능한 대상이 구현하는 공용 인터페이스
- [ ] PlayerController.cs 수정 — 대시 쿨다운을 IDashable 기반으로 정리
- [ ] OldDashHelper.cs 제거 — PlayerController.Dash()와 중복되던 로직 정리`;

const SCRIPTS: Record<string, DocAgentScript> = {
  "Requirements Agent": {
    turns: [
      "이 프로젝트에서 만들 게임의 핵심 장르와 플랫폼은 무엇인가요?",
      "플레이어가 매 순간 하는 핵심 행동(이동, 공격 등)을 조금 더 구체적으로 알려주실 수 있을까요?",
      "UI 화면 구성은 어떻게 되나요? (메인 메뉴, HUD, 게임오버 화면 등)",
      "이번 스코프에서 명시적으로 제외할 기능이 있다면 알려주세요.",
    ],
    document: REQUIREMENTS_DOCUMENT,
  },
  "Game Design Agent": {
    turns: [
      "대시 이동 시 무적 프레임을 적용할까요?",
      "좋아요. 무적 프레임 지속 시간은 대시 지속 시간과 동일하게 맞출까요, 아니면 별도로 설정할까요?",
      "대시 중 피격 판정은 어떻게 처리할까요? 완전 무시 / 데미지만 무시 / 넉백만 무시 중에서 골라주셔도 되고, 자유롭게 설명해주셔도 돼요.",
      "마지막으로, 대시 쿨다운은 몇 초 정도로 생각하고 계신가요?",
    ],
    document: GAME_DESIGN_DOCUMENT,
  },
  "Game Systems Agent": {
    turns: [
      "대시의 동작 규칙을 조금 더 구체화해볼게요 — 대시 중에는 공격 등 다른 입력을 받을 수 있나요?",
      "근접 공격과 원거리 공격의 판정 방식은 어떻게 다른가요? (즉시 판정 vs 투사체)",
      "피격 시 넉백과 체력 감소는 어떤 규칙으로 적용되나요?",
      "골드 획득과 소비 조건을 알려주세요.",
    ],
    document: SYSTEM_DESIGN_DOCUMENT,
  },
  "Class Design Agent": {
    turns: [
      "PlayerController가 대시/공격 처리를 직접 가질지, 별도 컴포넌트로 분리할지 정해볼까요?",
      "Enemy는 근접형/원거리형을 어떻게 구조화하는 게 좋을까요? (상속 vs 컴포지션)",
      "아이템은 어떤 방식으로 설계하면 좋을까요?",
    ],
    document: CLASS_DESIGN_DOCUMENT,
  },
  "Project Structure Agent": {
    turns: [
      "Assets 폴더 구조를 시스템별로 나눌까요, 기능별로 나눌까요?",
      "Assembly Definition은 어떤 기준으로 나누면 좋을까요?",
    ],
    document: PROJECT_STRUCTURE_DOCUMENT,
  },
  "ScriptableObject Agent": {
    turns: [
      "플레이어 관련 수치 중 디자이너가 직접 조정하고 싶은 값이 있을까요?",
      "몬스터나 아이템 쪽도 데이터로 분리하면 좋을 것 같은 부분이 있나요?",
    ],
    document: SCRIPTABLE_OBJECT_DOCUMENT,
  },
  "Documentation Agent": {
    turns: [
      "1~8단계 내용을 종합한 최종 문서에서 특별히 강조하고 싶은 부분이 있을까요?",
      "혹시 누락된 내용이 있다면 알려주세요.",
    ],
    document: DOCUMENTATION_DOCUMENT,
  },
};

// Any agent without a hand-written script above still needs to produce
// something coherent — a demo recording shouldn't break just because the
// presenter wandered into an unscripted Step.
function genericScript(agentName: string, docPath: string): DocAgentScript {
  const title = docPath
    .split("/")
    .pop()
    ?.replace(/\.md$/, "")
    .replace(/^\d+_/, "")
    .replace(/_/g, " ") ?? "Document";

  return {
    turns: [`(데모 모드) ${agentName}가 필요한 정보를 확인하고 있습니다. 계속 진행해주세요.`],
    document: `# ${title}\n\n## 개요\n- [ ] (데모 모드) 자동 생성된 예시 항목`,
  };
}

export function getMockDocAgentResponse(
  agentName: string,
  docPath: string,
  questionCount: number,
  finalize = false
): AgentChatResult {
  const script = SCRIPTS[agentName] ?? genericScript(agentName, docPath);

  // Manual "지금까지 내용으로 문서 만들기" always returns the script's
  // document immediately, same as a real Agent would when told to finalize —
  // it doesn't matter how many scripted turns have actually happened yet.
  if (finalize) {
    return {
      reply: "지금까지의 내용을 바탕으로 문서를 정리했습니다!",
      readyToGenerateDoc: true,
      document: script.document,
    };
  }

  if (questionCount < script.turns.length) {
    return { reply: script.turns[questionCount], readyToGenerateDoc: false };
  }

  return {
    reply: "필요한 내용을 모두 확인했습니다. 문서를 정리했어요!",
    readyToGenerateDoc: true,
    document: script.document,
  };
}
