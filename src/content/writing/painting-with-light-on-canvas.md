---
# PLACEHOLDER: a draft written for you from the actual implementation. Rewrite in your own voice or delete.
title: Painting with light on a canvas
description: How the long-exposure hero on the home page works, and how it stays cheap enough to run at 60 fps.
pubDate: 2026-09-20
tags: [canvas, graphics, performance]
placeholder: true
---


In a long-exposure photo, anything bright that moves turns into a streak. Bike
lights are the classic subject: a red line for the tail light, a white one for
the headlight, and a wavy trail from the pedal light as the crank turns.

The hero on the home page fakes that in a `<canvas>`.

## Trails are just timestamped points

Every light (your cursor or a passing cyclist's lamp) records a list of points,
each with a timestamp. Every frame, each trail is redrawn from scratch, and a
point's brightness is based on its age:

```ts
const fade = (age: number, life: number) => {
  const k = 1 - age / life;
  return k <= 0 ? 0 : k * Math.sqrt(k);
};
```

Drawing with `globalCompositeOperation = 'lighter'` makes overlapping light add
up the way it does on a sensor, so crossings glow brighter.

## The glow

Canvas `shadowBlur` looks nice but is slow. Instead each trail is stroked three
times: a wide, faint pass in the trail's color, a medium pass, and a thin core
blended toward white. Additive blending turns that into a convincing bloom.

## Keeping it cheap

A few cyclists at 60 points a second add up to thousands of segments, and
stroking each one separately would be far too slow. Neighboring segments of
similar brightness are merged instead: brightness is rounded into 12 buckets,
and each bucket becomes a single `Path2D`. A whole trail then costs about 36
strokes per frame, however long it is.

## Pedals make trochoids

A pedal light moves in a circle around the crank while the bike moves forward,
which traces a trochoid. When the crank radius is smaller than the distance
the bike travels per radian, the curve is a gentle, pinched wave instead of a
loop. That's the shape you see in real photos, so the radius is capped to stay
in that regime whatever the screen width.

## Respecting reduced motion

If your system asks for reduced motion, nothing animates. The scene is
simulated for a few seconds up front and drawn once, like a finished
photograph, and your own strokes stay put instead of fading.
