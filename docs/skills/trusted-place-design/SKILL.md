---
name: trusted-place-design
description: Design guidance for this project's Naver Map-like restaurant review service with verified receipt reviews, weighted ratings, place detail sheets, clean iOS-style UI, and review writing flows. Use when creating or revising UI, CSS, wireframes, design systems, page layouts, components, copy, or visual QA for the Hub service.
---

# Trusted Place Design

## Overview

Use this skill to design a Naver Map-like restaurant review service. The map is the main screen, and the core product value is verified restaurant reviews, not reservations.

## Design Principles

- Start with a full-screen map.
- Open a bottom sheet on mobile and a right-side sheet on desktop when a place marker is selected.
- Make the place sheet feel familiar to Naver Map users: place name, category, distance, rating, address, hours, phone, menu, reviews, and review writing.
- Use clean iOS-style surfaces: translucent panels, soft shadows, neutral text, and rounded controls.
- Use Naver green for selected markers and verified review trust signals.
- Use Korean UI copy by default.
- Use `docs/design-system.md` before inventing new colors, spacing, or component styles.

## Required UI Signals

Every core place or review UI should make these visible when relevant:

- Place category and distance
- Weighted rating
- Verified review count
- Receipt verification badge
- Positive vs critical review split
- Helpful/like count
- Review writing entry point

## Visual Rules

- Treat the map as the product surface, not a preview card.
- Use white or translucent iOS-style sheets over the map.
- Keep borders subtle and shadows soft.
- Use `#03c75a` for Naver-like map/review trust emphasis.
- Use `#007aff` for secondary iOS-style actions such as review writing.
- Do not make reservation controls prominent unless explicitly requested.
- Do not make a landing page when the task asks for the service UI.

## Core Screens

### Map Home

Show the map first. Include search, category chips, current location, zoom controls, nearby place markers, and selected marker state. The user should understand that this is a map service immediately.

### Place Detail Sheet

Show place name, category, distance, weighted rating, verified review count, address, hours, phone, representative menu, quick actions, review tabs, and review cards. Keep reservation out of the default layout.

### Review Writing Flow

Start with receipt upload. Show that OCR verifies place name and payment date before a review can be counted. Then allow rating and review text entry.

## Copy Tone

- Use concise Korean labels.
- Prefer "인증 리뷰", "리뷰 쓰기", "영수증 올리기", "좋았어요", "아쉬워요", "도움" over technical labels.
- Avoid overexplaining OCR or algorithms inside the UI.
- Explain trust through badges and short helper text.

## QA Checklist

- The map fills the first viewport.
- Selecting a marker clearly changes the place sheet.
- Reservation does not appear as the primary service.
- The review writing path is visible from the place sheet.
- Text does not overflow buttons, markers, tabs, or sheets.
- Mobile bottom sheet and desktop side sheet both remain usable.
