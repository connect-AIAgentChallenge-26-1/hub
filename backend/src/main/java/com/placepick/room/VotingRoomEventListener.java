package com.placepick.room;

@FunctionalInterface
public interface VotingRoomEventListener {

    void onEvent(VotingRoomEvent event);
}
