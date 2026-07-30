export type SpotKind = "official" | "candidate";

export type PhotoSpot = {
  id: string;
  kind: SpotKind;
  name: string;
  area: string;
  description: string;
  placeCategory: string;
  address: string;
  placeTip: string;
  thumbnailImageUrl?: string | null;
  latitude: number;
  longitude: number;
  likes?: number;
  threshold?: number;
  imageTone: "grove" | "lake" | "stage" | "plaza";
  // Candidate submissions can include reviewed guide data before becoming official.
  frames?: ShotFrame[];
};

export type ShotFrame = {
  id: string;
  title: string;
  subtitle: string;
  people: "solo" | "couple";
  tone: PhotoSpot["imageTone"];
  guide: string;
  referenceImageUrl?: string | null;
  overlayImageUrl?: string | null;
  backgroundGuide?: {
    horizonY: number | null;
    backgroundLines: Array<{
      id: string;
      start: [number, number];
      end: [number, number];
    }>;
  };
  poseGuide?: {
    personFrames: Array<Record<string, unknown>>;
    personPoses: Array<Record<string, unknown>>;
    personOutlines: Array<Record<string, unknown>>;
    imageSize?: {
      width: number;
      height: number;
    };
    orientation?: "portrait" | "landscape";
  };
};

export type ProposalDraft = {
  latitude: number;
  longitude: number;
  address: string;
  spotName: string;
  frame: "solo" | "couple";
  imageName: string | null;
};
