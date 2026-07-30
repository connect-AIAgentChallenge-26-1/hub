import unittest

import numpy as np

from src.composition_compare import compare_person_layouts, compare_person_pose_layouts, score_background_lines


class CompositionCompareTests(unittest.TestCase):
    def test_person_score_is_high_for_matching_layout(self):
        reference = [{"x": 0.35, "y": 0.3, "width": 0.2, "height": 0.5, "label": "Subject"}]
        captured = [{"x": 0.36, "y": 0.31, "width": 0.2, "height": 0.5, "label": "Subject"}]
        result = compare_person_layouts(reference, captured)
        self.assertEqual(result["status"], "ok")
        self.assertGreater(result["score"], 90)

    def test_identity_homography_keeps_registered_line_score_high(self):
        lines = [{"id": "line-1", "start": [0.2, 0.3], "end": [0.8, 0.3]}]
        result = score_background_lines(lines, np.eye(3), (1000, 800), (1000, 800))
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["score"], 100.0)

    def test_pose_score_is_high_for_matching_keypoints(self):
        frames = [{"x": 0.35, "y": 0.2, "width": 0.24, "height": 0.58, "label": "Subject"}]
        pose = {
            "label": "Subject",
            "keypoints": {
                "left_shoulder": [0.41, 0.35], "right_shoulder": [0.52, 0.35],
                "left_hip": [0.42, 0.55], "right_hip": [0.51, 0.55],
                "left_knee": [0.43, 0.68], "right_knee": [0.5, 0.68],
            },
        }
        result = compare_person_pose_layouts([pose], [pose], frames, frames)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["method"], "yolo_pose_keypoints")
        self.assertEqual(result["score"], 100.0)


if __name__ == "__main__":
    unittest.main()
