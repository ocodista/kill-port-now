window.KP_BENCHMARK_DATA = {
  "runId": "2026-05-10T01-26-39-435Z",
  "environment": {
    "generatedAt": "2026-05-10T01:26:39.436Z",
    "iterations": 3,
    "os": "Darwin",
    "arch": "arm64",
    "node": "v24.15.0",
    "rustc": "rustc 1.91.1 (ed61e7d7e 2025-11-07) (Homebrew)"
  },
  "assumptions": [
    "Compares only kill-port@2.0.1 and kill-port-now.",
    "Single-port benchmarks use temporary local fixture processes.",
    "Empty port measures no-op overhead when no listener exists.",
    "UDP kill and TCP kill start a fresh fixture process for each sample.",
    "Rows report mean, median, min, and max. Lower is better.",
    "Results vary with machine load and process count."
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
      "id": "kill-port-now",
      "name": "kill-port-now",
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
      "id": "udp-kill",
      "name": "UDP kill",
      "description": "Kill a temporary UDP socket."
    },
    {
      "id": "tcp-kill",
      "name": "TCP kill",
      "description": "Kill a temporary TCP listener."
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
      "toolId": "kill-port-now",
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
      "toolId": "kill-port-now",
      "operation": "kill",
      "protocol": "udp",
      "destructive": true,
      "validForKillComparison": true,
      "commandLabel": "bin/kp --quiet --udp-only <port>",
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
      "toolId": "kill-port-now",
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
    }
  ]
}
;
