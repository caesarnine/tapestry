FROM ghcr.io/prefix-dev/pixi:latest AS build

# copy source code, pixi.toml and pixi.lock to the container
COPY pixi.toml pixi.lock /app/
WORKDIR /app

RUN pixi install

RUN pixi shell-hook > /shell-hook.sh

# extend the shell-hook script to run the command passed to the container
RUN echo 'exec "$@"' >> /shell-hook.sh

FROM ubuntu:22.04 AS production

# only copy the production environment into prod container
# please note that the "prefix" (path) needs to stay the same as in the build container
COPY --from=build /app /app
COPY --from=build /shell-hook.sh /shell-hook.sh
COPY backend /app/backend
COPY frontend /app/frontend

WORKDIR /app
EXPOSE 8000

# set the entrypoint to the shell-hook script (activate the environment and run the command)
# no more pixi needed in the prod container
ENTRYPOINT ["/bin/bash", "/shell-hook.sh"]

CMD ["python", "backend/run.py"]