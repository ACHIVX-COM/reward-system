# ACHIVX Reward System gamification API

This document provides an overview of ACHIVX Reward System gamification-related functionality.
Detailed instructions on [configuration](./configuration.md) and [usage](./integration.md) of ACHIVX Reward System, including gamification functionality, are provided in corresponding documents.

## Actions

Actions are the most basic element of gamification system.
An action is always associated with only one user account.
Actions may include both actions performed by users they are associated with (e.g. **"write a post"**, **"leave a comment"**) and actions performed on such users or their content by other actors (e.g. **"get comment on a post"**, **"get a post banned"**).
THe set of available action types can be customized using [gamification configuration file](./configuration.md#actions).

Actions can be rewarded or penalized for with both internal tokens and **experience points** (aka **xp**).
E.g. a user may get **10xp** and **1 token** for **writing a post** and be penalized by **15xp** and lose **2 tokens** for **getting the post banned** by moderator.

## Account experience & levels

As mentioned before, users can accumulate experience points by performing actions.
Just like in actual games, after reaching a certain amount of **experience points** user can gain a next **level**.
In addition to the level number, users may also receive some tokens as reward for reaching that level.

Number of levels, as well as their experience thresholds and rewards can be configured using [gamification configuration file](./configuration.md#levels).

### Experience reduction

ACHIVX Reward System provides an optional possibility to reduce experience points.
This functionality is intended to provide a negative motivation for users to keep being active.

It works by subtracting a fixed value from user's experience every few days after user was inactive for certain interval.
Both subtracted amount, reduction interval and inactivity period required to start experience reduction are [configurable](./configuration.md#xp-reduction).

## Leader boards

ACHIVX Reward System provides a flexible leader board system.
A leader board contains list of few best users according to some metric.
The metrics supported by built-in leader board types are current user experience and numbers of actions specified types.

The list and parameters of available leader boards can be configured using [gamification configuration file](./configuration.md#leader-boards).

## Medals

Medals provide a way to visually distinguish outstanding users, such as users who have performed a lot of certain actions.
Medals do not give user any experience points or tokens.

The set of available medals can be configured using [gamification configuration file](./configuration.md#medals).
