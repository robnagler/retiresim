#!/bin/bash
set -eou pipefail

npm test 2>&1 | grep -E '^. (tests|pass|fail) ' | colrm 1 2
