FROM registry.fly.io/webrtc-new:deployment-01M1D15RJKAMGQPNF45Y1FHQYC
COPY apply-patch.cjs /tmp/hitel-public-room-patch.cjs
RUN node /tmp/hitel-public-room-patch.cjs && rm /tmp/hitel-public-room-patch.cjs
