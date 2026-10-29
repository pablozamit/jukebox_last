export default {
  "title": "La Catrina · mapa jugable",
  "version": 1,
  "units": "metros aproximados",
  "bounds": {
    "minX": -10,
    "maxX": 10,
    "minZ": -10,
    "maxZ": 20.8
  },
  "spawn": {
    "x": 0,
    "z": -6.86
  },
  "door": {
    "x": 0,
    "z": 0.2,
    "width": 3.6
  },
  "objects": [
    {
      "name": "street-sidewalk",
      "type": "ground",
      "zone": "street",
      "position": [
        0,
        -0.26,
        -7.3
      ],
      "size": [
        10,
        0.5,
        3.5
      ],
      "color": "#8b8a84"
    },
    {
      "name": "terrace-floor",
      "type": "ground",
      "zone": "terrace",
      "position": [
        0,
        -0.18,
        -4.3
      ],
      "size": [
        10,
        0.35,
        3.7
      ],
      "color": "#373330"
    },
    {
      "name": "terrace-table-1",
      "type": "table",
      "model": "rectangular",
      "zone": "terrace",
      "position": [
        -3.7,
        0,
        -4.55
      ],
      "size": [
        1.75,
        0.82,
        0.82
      ],
      "color": "#754b2e",
      "solid": true
    },
    {
      "name": "terrace-table-2",
      "type": "table",
      "model": "rectangular",
      "zone": "terrace",
      "position": [
        -1.86,
        0,
        -4.55
      ],
      "size": [
        1.75,
        0.82,
        0.82
      ],
      "color": "#754b2e",
      "solid": true
    },
    {
      "name": "terrace-stool-1",
      "type": "stool",
      "model": "backless",
      "zone": "terrace",
      "position": [
        -4.22,
        0,
        -5.4
      ],
      "size": [
        0.38,
        0.48,
        0.38
      ],
      "color": "#202321",
      "solid": true
    },
    {
      "name": "terrace-stool-2",
      "type": "stool",
      "model": "backless",
      "zone": "terrace",
      "position": [
        -4.22,
        0,
        -3.7
      ],
      "size": [
        0.38,
        0.48,
        0.38
      ],
      "color": "#202321",
      "solid": true
    },
    {
      "name": "terrace-stool-3",
      "type": "stool",
      "model": "backless",
      "zone": "terrace",
      "position": [
        -3.18,
        0,
        -5.4
      ],
      "size": [
        0.38,
        0.48,
        0.38
      ],
      "color": "#202321",
      "solid": true
    },
    {
      "name": "terrace-stool-4",
      "type": "stool",
      "model": "backless",
      "zone": "terrace",
      "position": [
        -3.18,
        0,
        -3.7
      ],
      "size": [
        0.38,
        0.48,
        0.38
      ],
      "color": "#202321",
      "solid": true
    },
    {
      "name": "terrace-stool-5",
      "type": "stool",
      "model": "backless",
      "zone": "terrace",
      "position": [
        -2.38,
        0,
        -5.4
      ],
      "size": [
        0.38,
        0.48,
        0.38
      ],
      "color": "#202321",
      "solid": true
    },
    {
      "name": "terrace-stool-6",
      "type": "stool",
      "model": "backless",
      "zone": "terrace",
      "position": [
        -2.38,
        0,
        -3.7
      ],
      "size": [
        0.38,
        0.48,
        0.38
      ],
      "color": "#202321",
      "solid": true
    },
    {
      "name": "terrace-stool-7",
      "type": "stool",
      "model": "backless",
      "zone": "terrace",
      "position": [
        -1.34,
        0,
        -5.4
      ],
      "size": [
        0.38,
        0.48,
        0.38
      ],
      "color": "#202321",
      "solid": true
    },
    {
      "name": "terrace-stool-8",
      "type": "stool",
      "model": "backless",
      "zone": "terrace",
      "position": [
        -1.34,
        0,
        -3.7
      ],
      "size": [
        0.38,
        0.48,
        0.38
      ],
      "color": "#202321",
      "solid": true
    },
    {
      "name": "vestibule-floor",
      "type": "ground",
      "zone": "vestibule",
      "position": [
        0,
        -0.08,
        -1.4
      ],
      "size": [
        6,
        0.18,
        2.9
      ],
      "color": "#282422"
    },
    {
      "name": "bar-main-floor",
      "type": "tiled-floor",
      "zone": "main",
      "position": [
        0,
        -0.1,
        10
      ],
      "size": [
        6,
        0.2,
        20
      ],
      "color": "#b6a991"
    },
    {
      "name": "glass-block-panel",
      "type": "glass-block",
      "zone": "partition",
      "position": [
        -2.52,
        1.55,
        0.1
      ],
      "size": [
        0.7,
        2.8,
        0.12
      ],
      "color": "#a9c6c1"
    },
    {
      "name": "entry-mural",
      "type": "mural",
      "zone": "vestibule",
      "position": [
        -2.8,
        1.7,
        -1.3
      ],
      "size": [
        0.08,
        2.4,
        2.4
      ],
      "color": "#a0474c"
    },
    {
      "name": "vestibule-bench",
      "type": "bench",
      "zone": "vestibule",
      "position": [
        -2,
        0,
        -2
      ],
      "size": [
        1.5,
        0.58,
        0.48
      ],
      "color": "#65462f",
      "solid": true
    },
    {
      "name": "vestibule-table",
      "type": "table",
      "model": "round",
      "zone": "vestibule",
      "position": [
        -1.1,
        0,
        -1.6
      ],
      "size": [
        0.7,
        0.72,
        0.7
      ],
      "color": "#67472e",
      "solid": true
    },
    {
      "name": "vestibule-high-table",
      "type": "table",
      "model": "rectangular-high",
      "zone": "vestibule",
      "position": [
        2.2,
        0,
        -1.5
      ],
      "size": [
        0.8,
        1.05,
        0.8
      ],
      "color": "#68462d",
      "solid": true
    },
    {
      "name": "foosball",
      "type": "foosball",
      "zone": "main",
      "position": [
        -1.45,
        0,
        3.15
      ],
      "size": [
        2.25,
        1.02,
        1.2
      ],
      "color": "#70452a",
      "solid": true
    },
    {
      "name": "pool-table-blue",
      "type": "pool-table",
      "zone": "main",
      "position": [
        1.2,
        0,
        5.55
      ],
      "size": [
        1.45,
        0.9,
        2.65
      ],
      "color": "#1e6c7c",
      "solid": true
    },
    {
      "name": "bar-counter",
      "type": "bar-counter",
      "zone": "main",
      "position": [
        -1.98,
        0,
        10.9
      ],
      "size": [
        1.45,
        1.08,
        8.1
      ],
      "color": "#2c211b",
      "solid": true
    },
    {
      "name": "backbar-shelves",
      "type": "shelves",
      "zone": "main",
      "position": [
        -2.77,
        1.15,
        10.9
      ],
      "size": [
        0.38,
        2.3,
        8
      ],
      "color": "#30241f"
    },
    {
      "name": "rear-screen",
      "type": "screen",
      "zone": "main",
      "position": [
        0,
        2.55,
        19.82
      ],
      "size": [
        3.1,
        2.1,
        0.16
      ],
      "color": "#183e50"
    },
    {
      "name": "right-side-banquette",
      "type": "banquette",
      "zone": "main",
      "position": [
        2.58,
        0,
        10
      ],
      "size": [
        0.65,
        0.95,
        10.4
      ],
      "color": "#653e30",
      "solid": true
    },
    {
      "name": "duct-west",
      "type": "duct",
      "zone": "ceiling",
      "position": [
        -2.46,
        4.1,
        10
      ],
      "size": [
        0.38,
        0.42,
        18.2
      ],
      "color": "#899397"
    },
    {
      "name": "duct-east",
      "type": "duct",
      "zone": "ceiling",
      "position": [
        2.46,
        4.1,
        10
      ],
      "size": [
        0.38,
        0.42,
        18.2
      ],
      "color": "#899397"
    },
    {
      "name": "ceiling-fan-1",
      "type": "fan",
      "zone": "ceiling",
      "position": [
        0,
        4.3,
        6
      ],
      "size": [
        1.65,
        0.12,
        1.65
      ],
      "color": "#d9d8cf"
    },
    {
      "name": "ceiling-fan-2",
      "type": "fan",
      "zone": "ceiling",
      "position": [
        0,
        4.3,
        14.5
      ],
      "size": [
        1.65,
        0.12,
        1.65
      ],
      "color": "#d9d8cf"
    },
    {
      "name": "west-wall",
      "type": "wall",
      "zone": "building",
      "position": [
        -3,
        1.7,
        10
      ],
      "size": [
        0.25,
        3.4,
        20
      ],
      "color": "#202324",
      "solid": true
    },
    {
      "name": "east-wall",
      "type": "wall",
      "zone": "building",
      "position": [
        3,
        0.75,
        10
      ],
      "size": [
        0.25,
        1.5,
        20
      ],
      "color": "#202324",
      "solid": true
    },
    {
      "name": "back-wall",
      "type": "wall",
      "zone": "building",
      "position": [
        0,
        1.7,
        20.1
      ],
      "size": [
        6,
        3.4,
        0.25
      ],
      "color": "#202324",
      "solid": true
    },
    {
      "name": "vestibule-partition-left",
      "type": "wall",
      "zone": "partition",
      "position": [
        -2.4,
        1.5,
        0
      ],
      "size": [
        1.2,
        3,
        0.18
      ],
      "color": "#eee9dd",
      "solid": true
    },
    {
      "name": "vestibule-partition-right",
      "type": "wall",
      "zone": "partition",
      "position": [
        2.4,
        1.5,
        0
      ],
      "size": [
        1.2,
        3,
        0.18
      ],
      "color": "#eee9dd",
      "solid": true
    },
    {
      "name": "vestibule-glazed-door",
      "type": "door",
      "model": "swinging-glass",
      "zone": "partition",
      "position": [
        -1.78,
        0,
        -0.42
      ],
      "size": [
        1.18,
        2.8,
        0.09
      ],
      "rotationY": -0.95,
      "color": "#d6dfd9"
    },
    {
      "name": "bar-stool-1",
      "type": "bar-stool",
      "model": "backless",
      "zone": "main",
      "position": [
        -0.78,
        0,
        6.75
      ],
      "size": [
        0.42,
        0.76,
        0.42
      ],
      "color": "#202321",
      "solid": true
    },
    {
      "name": "bar-stool-2",
      "type": "bar-stool",
      "model": "backless",
      "zone": "main",
      "position": [
        -0.78,
        0,
        8.129999999999999
      ],
      "size": [
        0.42,
        0.76,
        0.42
      ],
      "color": "#202321",
      "solid": true
    },
    {
      "name": "bar-stool-3",
      "type": "bar-stool",
      "model": "backless",
      "zone": "main",
      "position": [
        -0.78,
        0,
        9.51
      ],
      "size": [
        0.42,
        0.76,
        0.42
      ],
      "color": "#202321",
      "solid": true
    },
    {
      "name": "bar-stool-4",
      "type": "bar-stool",
      "model": "backless",
      "zone": "main",
      "position": [
        -0.78,
        0,
        10.89
      ],
      "size": [
        0.42,
        0.76,
        0.42
      ],
      "color": "#202321",
      "solid": true
    },
    {
      "name": "bar-stool-5",
      "type": "bar-stool",
      "model": "backless",
      "zone": "main",
      "position": [
        -0.78,
        0,
        12.27
      ],
      "size": [
        0.42,
        0.76,
        0.42
      ],
      "color": "#202321",
      "solid": true
    },
    {
      "name": "bar-stool-6",
      "type": "bar-stool",
      "model": "backless",
      "zone": "main",
      "position": [
        -0.78,
        0,
        13.649999999999999
      ],
      "size": [
        0.42,
        0.76,
        0.42
      ],
      "color": "#202321",
      "solid": true
    },
    {
      "name": "right-table-1",
      "type": "table",
      "model": "round",
      "zone": "main",
      "position": [
        1.68,
        0,
        9
      ],
      "size": [
        0.82,
        0.72,
        0.82
      ],
      "color": "#63442e",
      "solid": true
    },
    {
      "name": "right-chair-1-1",
      "type": "chair",
      "model": "metal-cafe",
      "zone": "main",
      "position": [
        1.68,
        0,
        8.34
      ],
      "size": [
        0.42,
        0.8,
        0.42
      ],
      "color": "#222725",
      "solid": true
    },
    {
      "name": "right-chair-1-2",
      "type": "chair",
      "model": "metal-cafe",
      "zone": "main",
      "position": [
        1.68,
        0,
        9.66
      ],
      "size": [
        0.42,
        0.8,
        0.42
      ],
      "color": "#222725",
      "solid": true
    },
    {
      "name": "right-table-2",
      "type": "table",
      "model": "round",
      "zone": "main",
      "position": [
        1.68,
        0,
        12.45
      ],
      "size": [
        0.82,
        0.72,
        0.82
      ],
      "color": "#63442e",
      "solid": true
    },
    {
      "name": "right-chair-2-1",
      "type": "chair",
      "model": "metal-cafe",
      "zone": "main",
      "position": [
        1.68,
        0,
        11.79
      ],
      "size": [
        0.42,
        0.8,
        0.42
      ],
      "color": "#222725",
      "solid": true
    },
    {
      "name": "right-chair-2-2",
      "type": "chair",
      "model": "metal-cafe",
      "zone": "main",
      "position": [
        1.68,
        0,
        13.11
      ],
      "size": [
        0.42,
        0.8,
        0.42
      ],
      "color": "#222725",
      "solid": true
    },
    {
      "name": "right-table-3",
      "type": "table",
      "model": "round",
      "zone": "main",
      "position": [
        1.68,
        0,
        15.9
      ],
      "size": [
        0.82,
        0.72,
        0.82
      ],
      "color": "#63442e",
      "solid": true
    },
    {
      "name": "right-chair-3-1",
      "type": "chair",
      "model": "metal-cafe",
      "zone": "main",
      "position": [
        1.68,
        0,
        15.24
      ],
      "size": [
        0.42,
        0.8,
        0.42
      ],
      "color": "#222725",
      "solid": true
    },
    {
      "name": "right-chair-3-2",
      "type": "chair",
      "model": "metal-cafe",
      "zone": "main",
      "position": [
        1.68,
        0,
        16.56
      ],
      "size": [
        0.42,
        0.8,
        0.42
      ],
      "color": "#222725",
      "solid": true
    },
    {
      "name": "entry-jamb-west",
      "type": "jamb",
      "zone": "vestibule",
      "position": [
        -2.88,
        1.25,
        -0.25
      ],
      "size": [
        0.24,
        2.5,
        0.65
      ],
      "color": "#202425",
      "solid": true
    },
    {
      "name": "entry-jamb-east",
      "type": "jamb",
      "zone": "vestibule",
      "position": [
        2.88,
        1.25,
        -0.25
      ],
      "size": [
        0.24,
        2.5,
        0.65
      ],
      "color": "#202425",
      "solid": true
    },
    {
      "name": "curb-front",
      "type": "curb",
      "zone": "street",
      "position": [
        0,
        0.08,
        -9.08
      ],
      "size": [
        10,
        0.16,
        0.14
      ],
      "color": "#8a9596",
      "solid": true
    },
    {
      "name": "column-west-1",
      "type": "column",
      "zone": "main",
      "position": [
        -2.72,
        1.65,
        3.65
      ],
      "size": [
        0.28,
        3.3,
        0.35
      ],
      "color": "#171b1b",
      "solid": true
    },
    {
      "name": "column-west-2",
      "type": "column",
      "zone": "main",
      "position": [
        -2.72,
        1.65,
        7.35
      ],
      "size": [
        0.28,
        3.3,
        0.35
      ],
      "color": "#171b1b",
      "solid": true
    },
    {
      "name": "column-west-3",
      "type": "column",
      "zone": "main",
      "position": [
        -2.72,
        1.65,
        11.05
      ],
      "size": [
        0.28,
        3.3,
        0.35
      ],
      "color": "#171b1b",
      "solid": true
    },
    {
      "name": "column-west-4",
      "type": "column",
      "zone": "main",
      "position": [
        -2.72,
        1.65,
        14.750000000000002
      ],
      "size": [
        0.28,
        3.3,
        0.35
      ],
      "color": "#171b1b",
      "solid": true
    },
    {
      "name": "column-west-5",
      "type": "column",
      "zone": "main",
      "position": [
        -2.72,
        1.65,
        18.45
      ],
      "size": [
        0.28,
        3.3,
        0.35
      ],
      "color": "#171b1b",
      "solid": true
    }
  ],
  "floorRegions": [
    {
      "name": "street-sidewalk",
      "minX": -5,
      "maxX": 5,
      "minZ": -9.05,
      "maxZ": -5.55
    },
    {
      "name": "terrace",
      "minX": -5,
      "maxX": 5,
      "minZ": -6.1,
      "maxZ": -2.45
    },
    {
      "name": "vestibule",
      "minX": -3,
      "maxX": 3,
      "minZ": -2.86,
      "maxZ": 0.12
    },
    {
      "name": "main-room",
      "minX": -2.875,
      "maxX": 2.875,
      "minZ": -0.03,
      "maxZ": 19.97
    }
  ]
}
