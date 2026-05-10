window.KP_BENCHMARK_DATA = {
  "runId": "2026-05-10T01-26-39-435Z",
  "environment": {
    "generatedAt": "2026-05-10T01:26:39.436Z",
    "iterations": 3,
    "os": "Darwin",
    "arch": "arm64",
    "node": "v24.15.0",
    "rustc": "rustc 1.91.1 (ed61e7d7e 2025-11-07) (Homebrew)",
    "lsof": "available",
    "bash": "GNU bash, version 3.2.57(1)-release (arm64-apple-darwin25)"
  },
  "assumptions": [
    "Single-port benchmarks use temporary local fixture processes.",
    "macOS lsof rows isolate targeted lsof cost and do not represent the legacy kill-port shell pipeline.",
    "bash /dev/tcp rows are checks only. They cannot map a port to a PID or kill it safely.",
    "Lower is better. Results vary with process count and machine load."
  ],
  "tools": [
    {
      "id": "kill-port",
      "name": "kill-port",
      "usesLsof": true,
      "usesShellPipeline": true,
      "native": false
    },
    {
      "id": "kill-port-now-js",
      "name": "kill-port-now JS",
      "usesLsof": true,
      "usesShellPipeline": false,
      "native": false
    },
    {
      "id": "macos-lsof",
      "name": "macOS lsof",
      "usesLsof": true,
      "usesShellPipeline": false,
      "native": false
    },
    {
      "id": "macos-netstat",
      "name": "macOS netstat",
      "usesLsof": false,
      "usesShellPipeline": false,
      "native": false
    },
    {
      "id": "bash-netstat",
      "name": "bash netstat",
      "usesLsof": false,
      "usesShellPipeline": true,
      "native": false
    },
    {
      "id": "kill-port-now-rust",
      "name": "kill-port-now Rust",
      "usesLsof": false,
      "usesShellPipeline": false,
      "native": true
    },
    {
      "id": "bash-dev-tcp",
      "name": "bash /dev/tcp",
      "usesLsof": false,
      "usesShellPipeline": false,
      "native": false
    },
    {
      "id": "fp-rs",
      "name": "fp-rs",
      "usesLsof": false,
      "usesShellPipeline": false,
      "native": true
    }
  ],
  "scenarios": [
    {
      "id": "empty-port",
      "name": "Empty port",
      "description": "No listener exists. Measures no-op/rejection overhead."
    },
    {
      "id": "tcp-kill",
      "name": "TCP kill",
      "description": "Kill a temporary TCP listener."
    },
    {
      "id": "udp-kill",
      "name": "UDP kill",
      "description": "Kill a temporary UDP socket."
    },
    {
      "id": "tcp-check-free",
      "name": "TCP free check",
      "description": "Check an unused TCP port without killing."
    },
    {
      "id": "tcp-check-in-use",
      "name": "TCP in-use check",
      "description": "Check a live TCP listener without killing."
    }
  ],
  "rows": [
    {
      "scenarioId": "empty-port",
      "toolId": "kill-port",
      "operation": "no-op",
      "protocol": "tcp",
      "destructive": false,
      "validForKillComparison": true,
      "commandLabel": "node kill-port/cli.js <free-port>",
      "notes": [],
      "samples": [
        10096.629167,
        10273.540291,
        12726.695666
      ],
      "meanMs": 11032.288374666665,
      "medianMs": 10273.540291,
      "minMs": 10096.629167,
      "maxMs": 12726.695666
    },
    {
      "scenarioId": "empty-port",
      "toolId": "kill-port-now-js",
      "operation": "no-op",
      "protocol": "tcp",
      "destructive": false,
      "validForKillComparison": true,
      "commandLabel": "node bin/kp-js --quiet <free-port>",
      "notes": [],
      "samples": [
        54.886917,
        58.177959,
        59.871542
      ],
      "meanMs": 57.64547266666667,
      "medianMs": 58.177959,
      "minMs": 54.886917,
      "maxMs": 59.871542
    },
    {
      "scenarioId": "empty-port",
      "toolId": "macos-lsof",
      "operation": "lookup",
      "protocol": "tcp",
      "destructive": false,
      "validForKillComparison": false,
      "commandLabel": "lsof -nP -t -iTCP:<port> -sTCP:LISTEN",
      "notes": [
        "Lookup only; included to isolate macOS lsof cost."
      ],
      "samples": [
        26.7025,
        27.919458,
        27.954458
      ],
      "meanMs": 27.525471999999997,
      "medianMs": 27.919458,
      "minMs": 26.7025,
      "maxMs": 27.954458
    },
    {
      "scenarioId": "empty-port",
      "toolId": "macos-netstat",
      "operation": "lookup",
      "protocol": "tcp",
      "destructive": false,
      "validForKillComparison": false,
      "commandLabel": "netstat -anv -p tcp",
      "notes": [
        "Lookup only; no lsof. macOS netstat exposes command:pid in verbose mode."
      ],
      "samples": [
        3.69175,
        3.948375,
        4.349084
      ],
      "meanMs": 3.9964029999999995,
      "medianMs": 3.948375,
      "minMs": 3.69175,
      "maxMs": 4.349084
    },
    {
      "scenarioId": "empty-port",
      "toolId": "kill-port-now-rust",
      "operation": "no-op",
      "protocol": "tcp",
      "destructive": false,
      "validForKillComparison": true,
      "commandLabel": "bin/kp --quiet <free-port>",
      "notes": [],
      "samples": [
        2.906959,
        3.0075,
        3.146458
      ],
      "meanMs": 3.0203056666666668,
      "medianMs": 3.0075,
      "minMs": 2.906959,
      "maxMs": 3.146458
    },
    {
      "scenarioId": "tcp-kill",
      "toolId": "kill-port",
      "operation": "kill",
      "protocol": "tcp",
      "destructive": true,
      "validForKillComparison": true,
      "commandLabel": "node kill-port/cli.js <port>",
      "notes": [],
      "samples": [
        10164.412292,
        10169.060375,
        10599.588125
      ],
      "meanMs": 10311.020264,
      "medianMs": 10169.060375,
      "minMs": 10164.412292,
      "maxMs": 10599.588125
    },
    {
      "scenarioId": "tcp-kill",
      "toolId": "kill-port-now-js",
      "operation": "kill",
      "protocol": "tcp",
      "destructive": true,
      "validForKillComparison": true,
      "commandLabel": "node bin/kp-js --quiet <port>",
      "notes": [],
      "samples": [
        55.630666,
        57.300459,
        62.387375
      ],
      "meanMs": 58.4395,
      "medianMs": 57.300459,
      "minMs": 55.630666,
      "maxMs": 62.387375
    },
    {
      "scenarioId": "tcp-kill",
      "toolId": "macos-lsof",
      "operation": "kill",
      "protocol": "tcp",
      "destructive": true,
      "validForKillComparison": true,
      "commandLabel": "lsof -nP -t -iTCP:<port> -sTCP:LISTEN + kill",
      "notes": [],
      "samples": [
        27.40575,
        27.749208,
        27.999417
      ],
      "meanMs": 27.718125,
      "medianMs": 27.749208,
      "minMs": 27.40575,
      "maxMs": 27.999417
    },
    {
      "scenarioId": "tcp-kill",
      "toolId": "macos-netstat",
      "operation": "kill",
      "protocol": "tcp",
      "destructive": true,
      "validForKillComparison": true,
      "commandLabel": "netstat -anv -p tcp + kill",
      "notes": [
        "No lsof. Parses macOS verbose netstat command:pid column."
      ],
      "samples": [
        3.987541,
        4.099125,
        4.124417
      ],
      "meanMs": 4.070360999999999,
      "medianMs": 4.099125,
      "minMs": 3.987541,
      "maxMs": 4.124417
    },
    {
      "scenarioId": "tcp-kill",
      "toolId": "bash-netstat",
      "operation": "kill",
      "protocol": "tcp",
      "destructive": true,
      "validForKillComparison": true,
      "commandLabel": "bash: netstat -anv -p tcp | awk + kill",
      "notes": [
        "No lsof. macOS-specific shell implementation."
      ],
      "samples": [
        5.377834,
        5.431334,
        5.524375
      ],
      "meanMs": 5.444514333333333,
      "medianMs": 5.431334,
      "minMs": 5.377834,
      "maxMs": 5.524375
    },
    {
      "scenarioId": "tcp-kill",
      "toolId": "kill-port-now-rust",
      "operation": "kill",
      "protocol": "tcp",
      "destructive": true,
      "validForKillComparison": true,
      "commandLabel": "bin/kp --quiet <port>",
      "notes": [],
      "samples": [
        3.114083,
        3.152417,
        3.444959
      ],
      "meanMs": 3.2371529999999997,
      "medianMs": 3.152417,
      "minMs": 3.114083,
      "maxMs": 3.444959
    },
    {
      "scenarioId": "udp-kill",
      "toolId": "kill-port",
      "operation": "kill",
      "protocol": "udp",
      "destructive": true,
      "validForKillComparison": true,
      "commandLabel": "node kill-port/cli.js --method udp <port>",
      "notes": [],
      "samples": [
        10162.543083,
        10163.304417,
        10333.388875
      ],
      "meanMs": 10219.745458333333,
      "medianMs": 10163.304417,
      "minMs": 10162.543083,
      "maxMs": 10333.388875
    },
    {
      "scenarioId": "udp-kill",
      "toolId": "kill-port-now-js",
      "operation": "kill",
      "protocol": "udp",
      "destructive": true,
      "validForKillComparison": true,
      "commandLabel": "node bin/kp-js --quiet --method udp <port>",
      "notes": [],
      "samples": [
        56.128166,
        56.772292,
        58.761875
      ],
      "meanMs": 57.22077766666666,
      "medianMs": 56.772292,
      "minMs": 56.128166,
      "maxMs": 58.761875
    },
    {
      "scenarioId": "udp-kill",
      "toolId": "macos-lsof",
      "operation": "kill",
      "protocol": "udp",
      "destructive": true,
      "validForKillComparison": true,
      "commandLabel": "lsof -nP -t -iUDP:<port> + kill",
      "notes": [],
      "samples": [
        28.097,
        28.512667,
        29.243416
      ],
      "meanMs": 28.617694333333333,
      "medianMs": 28.512667,
      "minMs": 28.097,
      "maxMs": 29.243416
    },
    {
      "scenarioId": "udp-kill",
      "toolId": "macos-netstat",
      "operation": "kill",
      "protocol": "udp",
      "destructive": true,
      "validForKillComparison": true,
      "commandLabel": "netstat -anv -p udp + kill",
      "notes": [
        "No lsof. Parses macOS verbose netstat command:pid column."
      ],
      "samples": [
        3.565375,
        3.888291,
        3.980583
      ],
      "meanMs": 3.8114163333333337,
      "medianMs": 3.888291,
      "minMs": 3.565375,
      "maxMs": 3.980583
    },
    {
      "scenarioId": "udp-kill",
      "toolId": "bash-netstat",
      "operation": "kill",
      "protocol": "udp",
      "destructive": true,
      "validForKillComparison": true,
      "commandLabel": "bash: netstat -anv -p udp | awk + kill",
      "notes": [
        "No lsof. macOS-specific shell implementation."
      ],
      "samples": [
        5.022833,
        5.093167,
        5.374875
      ],
      "meanMs": 5.163625,
      "medianMs": 5.093167,
      "minMs": 5.022833,
      "maxMs": 5.374875
    },
    {
      "scenarioId": "udp-kill",
      "toolId": "kill-port-now-rust",
      "operation": "kill",
      "protocol": "udp",
      "destructive": true,
      "validForKillComparison": true,
      "commandLabel": "bin/kp --quiet --method udp <port>",
      "notes": [],
      "samples": [
        3.036,
        3.355083,
        3.373291
      ],
      "meanMs": 3.2547913333333334,
      "medianMs": 3.355083,
      "minMs": 3.036,
      "maxMs": 3.373291
    },
    {
      "scenarioId": "tcp-check-free",
      "toolId": "bash-dev-tcp",
      "operation": "check",
      "protocol": "tcp",
      "destructive": false,
      "validForKillComparison": false,
      "commandLabel": "/bin/bash -c : >/dev/tcp/127.0.0.1/<port>",
      "notes": [
        "TCP reachability check only; cannot identify or kill PID."
      ],
      "samples": [
        2.384708,
        2.5195,
        2.568875
      ],
      "meanMs": 2.491027666666666,
      "medianMs": 2.5195,
      "minMs": 2.384708,
      "maxMs": 2.568875
    },
    {
      "scenarioId": "tcp-check-free",
      "toolId": "fp-rs",
      "operation": "check",
      "protocol": "tcp",
      "destructive": false,
      "validForKillComparison": false,
      "commandLabel": "bin/fp <free-port>",
      "notes": [],
      "samples": [
        2.106666,
        2.113833,
        2.159375
      ],
      "meanMs": 2.126624666666667,
      "medianMs": 2.113833,
      "minMs": 2.106666,
      "maxMs": 2.159375
    },
    {
      "scenarioId": "tcp-check-free",
      "toolId": "macos-lsof",
      "operation": "lookup",
      "protocol": "tcp",
      "destructive": false,
      "validForKillComparison": false,
      "commandLabel": "lsof -nP -t -iTCP:<port> -sTCP:LISTEN",
      "notes": [],
      "samples": [
        27.569916,
        27.805375,
        27.935541
      ],
      "meanMs": 27.770277333333336,
      "medianMs": 27.805375,
      "minMs": 27.569916,
      "maxMs": 27.935541
    },
    {
      "scenarioId": "tcp-check-free",
      "toolId": "macos-netstat",
      "operation": "lookup",
      "protocol": "tcp",
      "destructive": false,
      "validForKillComparison": false,
      "commandLabel": "netstat -anv -p tcp",
      "notes": [
        "No lsof. Can map port to PID on macOS, unlike bash /dev/tcp."
      ],
      "samples": [
        3.663292,
        3.750125,
        3.774625
      ],
      "meanMs": 3.7293473333333336,
      "medianMs": 3.750125,
      "minMs": 3.663292,
      "maxMs": 3.774625
    },
    {
      "scenarioId": "tcp-check-in-use",
      "toolId": "bash-dev-tcp",
      "operation": "check",
      "protocol": "tcp",
      "destructive": false,
      "validForKillComparison": false,
      "commandLabel": "/bin/bash -c : >/dev/tcp/127.0.0.1/<port>",
      "notes": [
        "TCP reachability check only; cannot identify or kill PID."
      ],
      "samples": [
        2.664333,
        2.710167,
        2.788584
      ],
      "meanMs": 2.7210280000000004,
      "medianMs": 2.710167,
      "minMs": 2.664333,
      "maxMs": 2.788584
    },
    {
      "scenarioId": "tcp-check-in-use",
      "toolId": "fp-rs",
      "operation": "check",
      "protocol": "tcp",
      "destructive": false,
      "validForKillComparison": false,
      "commandLabel": "bin/fp <used-port>",
      "notes": [],
      "samples": [
        2.142791,
        2.217166,
        2.3825
      ],
      "meanMs": 2.2474856666666665,
      "medianMs": 2.217166,
      "minMs": 2.142791,
      "maxMs": 2.3825
    },
    {
      "scenarioId": "tcp-check-in-use",
      "toolId": "macos-lsof",
      "operation": "lookup",
      "protocol": "tcp",
      "destructive": false,
      "validForKillComparison": false,
      "commandLabel": "lsof -nP -t -iTCP:<port> -sTCP:LISTEN",
      "notes": [],
      "samples": [
        27.91475,
        28.3305,
        29.068042
      ],
      "meanMs": 28.437763999999998,
      "medianMs": 28.3305,
      "minMs": 27.91475,
      "maxMs": 29.068042
    },
    {
      "scenarioId": "tcp-check-in-use",
      "toolId": "macos-netstat",
      "operation": "lookup",
      "protocol": "tcp",
      "destructive": false,
      "validForKillComparison": false,
      "commandLabel": "netstat -anv -p tcp",
      "notes": [
        "No lsof. Can map port to PID on macOS, unlike bash /dev/tcp."
      ],
      "samples": [
        3.968583,
        3.976291,
        3.991333
      ],
      "meanMs": 3.9787356666666667,
      "medianMs": 3.976291,
      "minMs": 3.968583,
      "maxMs": 3.991333
    }
  ]
};
