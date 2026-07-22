package com.placepick.recommendation.application.scoring;

import com.placepick.recommendation.embedding.domain.EmbeddingShadowExample;
import com.placepick.recommendation.embedding.domain.ShadowCorpusSplit;
import java.util.List;

/** Versioned, synthetic labeled corpus used only for preference-matching shadow evaluation. */
public final class EmbeddingShadowCorpus {

    public static final String VERSION = "preference-embedding-shadow.v1";

    private static final List<EmbeddingShadowExample> V1 = List.of(
        train("01", "조용한", "차분하고 한적한 좌석이 마련된 공간", true),
        train("02", "주차", "매장 전용 주차장을 이용할 수 있음", true),
        train("03", "창가", "햇빛이 드는 윈도우석이 준비되어 있음", true),
        train("04", "디저트", "케이크와 구움과자를 함께 판매함", true),
        train("05", "반려동물", "애견 동반 손님을 위한 좌석이 있음", true),
        train("06", "조용한", "대화 소리가 크고 활기찬 음악이 흐르는 공간", false),
        train("07", "주차", "인근 유료 주차만 가능하고 매장 주차는 제공하지 않음", false),
        train("08", "창가", "창문이 없는 지하 좌석만 운영함", false),
        train("09", "디저트", "베이커리와 케이크는 판매하지 않고 음료만 제공함", false),
        train("10", "반려동물", "반려동물 동반이 불가능한 매장", false),
        holdout("01", "조용한", "차분하게 대화하기 좋은 한적한 분위기", true),
        holdout("02", "창가", "바깥을 볼 수 있는 윈도우석을 선택할 수 있음", true),
        holdout("03", "비건", "우유와 달걀을 쓰지 않은 채식 메뉴를 제공함", true),
        holdout("04", "노트북", "콘센트가 넉넉한 작업 공간을 운영함", true),
        holdout("05", "반려동물", "애견과 함께 머물 수 있는 좌석이 있음", true),
        holdout("06", "주차", "매장 주차는 제공하지 않고 대중교통 이용을 권장함", false),
        holdout("07", "조용한", "큰 음악과 활발한 대화를 즐기는 분위기", false),
        holdout("08", "디저트", "베이커리는 없으며 커피와 차만 판매함", false),
        holdout("09", "뷰", "창문이 없는 지하 공간으로 전망을 볼 수 없음", false),
        holdout("10", "단체석", "한 사람용 좌석만 있어 단체 이용이 어려움", false)
    );

    private EmbeddingShadowCorpus() {
    }

    public static List<EmbeddingShadowExample> fixedV1() {
        return V1;
    }

    private static EmbeddingShadowExample train(
        String number,
        String preference,
        String evidence,
        boolean expected
    ) {
        return example(
            "shadow-train-" + number,
            ShadowCorpusSplit.TRAIN,
            preference,
            evidence,
            expected
        );
    }

    private static EmbeddingShadowExample holdout(
        String number,
        String preference,
        String evidence,
        boolean expected
    ) {
        return example(
            "shadow-holdout-" + number,
            ShadowCorpusSplit.HOLDOUT,
            preference,
            evidence,
            expected
        );
    }

    private static EmbeddingShadowExample example(
        String id,
        ShadowCorpusSplit split,
        String preference,
        String evidence,
        boolean expected
    ) {
        return new EmbeddingShadowExample(id, split, preference, evidence, expected);
    }
}
