/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/abyss_haul.json`.
 */
export type AbyssHaul = {
  "address": "9qe9i4BVKb3UzA9fAHfdpDnwCvymk7vBx4zkgGRBJw8o",
  "metadata": {
    "name": "abyssHaul",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "docs": [
    "Abyss Haul. Instruction reference and formulas: docs/DESIGN.md."
  ],
  "instructions": [
    {
      "name": "acceptAdmin",
      "discriminator": [
        112,
        42,
        45,
        90,
        116,
        181,
        13,
        170
      ],
      "accounts": [
        {
          "name": "newAdmin",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "claim",
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "checkpoints",
          "writable": true
        },
        {
          "name": "harbor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  114,
                  98,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "crank",
      "discriminator": [
        0,
        232,
        3,
        195,
        124,
        117,
        105,
        53
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "checkpoints",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "dock",
      "discriminator": [
        209,
        38,
        213,
        182,
        121,
        90,
        178,
        15
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "checkpoints",
          "writable": true
        },
        {
          "name": "harbor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  114,
                  98,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "sub",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "asset",
          "writable": true
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "mplCore",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "expandHarbor",
      "discriminator": [
        82,
        249,
        209,
        193,
        199,
        224,
        38,
        216
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "checkpoints",
          "writable": true
        },
        {
          "name": "harbor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  114,
                  98,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "expeditionReturnCommit",
      "discriminator": [
        189,
        112,
        131,
        188,
        90,
        168,
        180,
        17
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "harbor",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  114,
                  98,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "sub",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "sub.asset",
                "account": "sub"
              }
            ]
          }
        },
        {
          "name": "vrfNetworkState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  111,
                  45,
                  118,
                  114,
                  102,
                  45,
                  110,
                  101,
                  116,
                  119,
                  111,
                  114,
                  107,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                7,
                71,
                177,
                26,
                250,
                145,
                180,
                209,
                249,
                34,
                242,
                123,
                14,
                186,
                193,
                218,
                178,
                59,
                33,
                41,
                164,
                190,
                243,
                79,
                50,
                164,
                123,
                88,
                245,
                206,
                252,
                120
              ]
            }
          }
        },
        {
          "name": "vrfTreasury",
          "writable": true
        },
        {
          "name": "vrfRequest",
          "writable": true
        },
        {
          "name": "vrfProgram",
          "address": "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "expeditionReturnReveal",
      "discriminator": [
        138,
        65,
        195,
        135,
        99,
        197,
        107,
        216
      ],
      "accounts": [
        {
          "name": "cranker",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "checkpoints",
          "writable": true
        },
        {
          "name": "harbor",
          "writable": true
        },
        {
          "name": "sub",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "sub.asset",
                "account": "sub"
              }
            ]
          }
        },
        {
          "name": "vrfRequest"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "expeditionStart",
      "discriminator": [
        54,
        178,
        7,
        205,
        253,
        251,
        163,
        156
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "checkpoints",
          "writable": true
        },
        {
          "name": "harbor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  114,
                  98,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "sub",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "sub.asset",
                "account": "sub"
              }
            ]
          }
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "hours",
          "type": "u8"
        }
      ]
    },
    {
      "name": "fundPool",
      "discriminator": [
        36,
        57,
        233,
        176,
        181,
        20,
        87,
        159
      ],
      "accounts": [
        {
          "name": "funder",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "checkpoints",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "deployer",
          "writable": true,
          "signer": true
        },
        {
          "name": "programData",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  131,
                  83,
                  97,
                  74,
                  47,
                  69,
                  208,
                  134,
                  115,
                  233,
                  218,
                  65,
                  188,
                  228,
                  231,
                  77,
                  221,
                  224,
                  135,
                  60,
                  125,
                  112,
                  186,
                  242,
                  79,
                  92,
                  20,
                  232,
                  157,
                  5,
                  221,
                  228
                ]
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                2,
                168,
                246,
                145,
                78,
                136,
                161,
                176,
                226,
                16,
                21,
                62,
                247,
                99,
                174,
                43,
                0,
                194,
                185,
                61,
                22,
                193,
                36,
                210,
                192,
                83,
                122,
                16,
                4,
                128,
                0,
                0
              ]
            }
          }
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "checkpoints",
          "docs": [
            "Created by a top-level create_account (owner = this program) earlier in the same transaction."
          ],
          "writable": true
        },
        {
          "name": "authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "collection",
          "writable": true,
          "signer": true
        },
        {
          "name": "mplCore",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "admin",
          "type": "pubkey"
        },
        {
          "name": "treasury",
          "type": "pubkey"
        },
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "params"
            }
          }
        },
        {
          "name": "uriBase",
          "type": "string"
        },
        {
          "name": "collectionUri",
          "type": "string"
        }
      ]
    },
    {
      "name": "merge",
      "discriminator": [
        148,
        141,
        236,
        47,
        174,
        126,
        69,
        111
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "checkpoints",
          "writable": true
        },
        {
          "name": "harbor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  114,
                  98,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "subA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "assetA"
              }
            ]
          }
        },
        {
          "name": "subB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "assetB"
              }
            ]
          }
        },
        {
          "name": "assetA",
          "writable": true
        },
        {
          "name": "assetB",
          "writable": true
        },
        {
          "name": "newAsset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool.mintedCount",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "newSub",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "newAsset"
              }
            ]
          }
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "mplCore",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "mintCommit",
      "discriminator": [
        127,
        210,
        140,
        35,
        67,
        169,
        144,
        165
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "checkpoints",
          "writable": true
        },
        {
          "name": "vrfNetworkState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  111,
                  45,
                  118,
                  114,
                  102,
                  45,
                  110,
                  101,
                  116,
                  119,
                  111,
                  114,
                  107,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                7,
                71,
                177,
                26,
                250,
                145,
                180,
                209,
                249,
                34,
                242,
                123,
                14,
                186,
                193,
                218,
                178,
                59,
                33,
                41,
                164,
                190,
                243,
                79,
                50,
                164,
                123,
                88,
                245,
                206,
                252,
                120
              ]
            }
          }
        },
        {
          "name": "vrfTreasury",
          "writable": true
        },
        {
          "name": "vrfRequest",
          "writable": true
        },
        {
          "name": "vrfProgram",
          "address": "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y"
        },
        {
          "name": "pending",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  110,
                  100,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "pool.mintedCount",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "mintReveal",
      "discriminator": [
        27,
        133,
        119,
        108,
        109,
        97,
        170,
        236
      ],
      "accounts": [
        {
          "name": "cranker",
          "writable": true,
          "signer": true
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "pending",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  110,
                  100,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "pending.mintIndex",
                "account": "pendingMint"
              }
            ]
          }
        },
        {
          "name": "vrfRequest"
        },
        {
          "name": "asset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pending.mintIndex",
                "account": "pendingMint"
              }
            ]
          }
        },
        {
          "name": "sub",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "mplCore",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "openHarbor",
      "discriminator": [
        249,
        185,
        160,
        229,
        94,
        139,
        81,
        11
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "harbor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  114,
                  98,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "proposeAdmin",
      "discriminator": [
        121,
        214,
        199,
        212,
        87,
        39,
        117,
        234
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "reinforce",
      "discriminator": [
        254,
        170,
        163,
        213,
        240,
        38,
        189,
        205
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "checkpoints",
          "writable": true
        },
        {
          "name": "harbor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  114,
                  98,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "sub",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "asset"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "setPause",
      "discriminator": [
        63,
        32,
        154,
        2,
        56,
        103,
        79,
        45
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "mint",
          "type": "bool"
        },
        {
          "name": "upgrades",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settle",
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "checkpoints",
          "writable": true
        },
        {
          "name": "harbor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  114,
                  98,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "harbor.owner",
                "account": "harbor"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "undock",
      "discriminator": [
        142,
        71,
        239,
        160,
        80,
        225,
        147,
        15
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "checkpoints",
          "writable": true
        },
        {
          "name": "harbor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  114,
                  98,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "sub",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "asset",
          "writable": true
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "mplCore",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "updateConfig",
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "params"
            }
          }
        },
        {
          "name": "treasury",
          "type": "pubkey"
        },
        {
          "name": "uriBase",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "checkpoints",
      "discriminator": [
        141,
        3,
        168,
        136,
        95,
        58,
        80,
        245
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "harbor",
      "discriminator": [
        66,
        20,
        3,
        62,
        182,
        142,
        182,
        1
      ]
    },
    {
      "name": "pendingMint",
      "discriminator": [
        49,
        154,
        10,
        122,
        115,
        84,
        32,
        175
      ]
    },
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    },
    {
      "name": "sub",
      "discriminator": [
        204,
        213,
        163,
        209,
        41,
        34,
        182,
        23
      ]
    },
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "events": [
    {
      "name": "claimed",
      "discriminator": [
        217,
        192,
        123,
        72,
        108,
        150,
        248,
        33
      ]
    },
    {
      "name": "configUpdated",
      "discriminator": [
        40,
        241,
        230,
        122,
        11,
        19,
        198,
        194
      ]
    },
    {
      "name": "docked",
      "discriminator": [
        36,
        31,
        237,
        146,
        190,
        25,
        63,
        217
      ]
    },
    {
      "name": "expeditionReturned",
      "discriminator": [
        51,
        76,
        120,
        241,
        251,
        169,
        65,
        142
      ]
    },
    {
      "name": "expeditionStarted",
      "discriminator": [
        183,
        32,
        29,
        124,
        102,
        77,
        166,
        252
      ]
    },
    {
      "name": "feePaid",
      "discriminator": [
        159,
        12,
        52,
        212,
        249,
        36,
        24,
        18
      ]
    },
    {
      "name": "harborExpanded",
      "discriminator": [
        109,
        5,
        126,
        177,
        125,
        242,
        86,
        86
      ]
    },
    {
      "name": "merged",
      "discriminator": [
        57,
        129,
        241,
        73,
        156,
        41,
        126,
        251
      ]
    },
    {
      "name": "mintCommitted",
      "discriminator": [
        251,
        226,
        190,
        44,
        132,
        80,
        96,
        125
      ]
    },
    {
      "name": "pauseSet",
      "discriminator": [
        175,
        57,
        198,
        136,
        192,
        66,
        204,
        73
      ]
    },
    {
      "name": "poolFunded",
      "discriminator": [
        164,
        221,
        242,
        68,
        164,
        64,
        24,
        214
      ]
    },
    {
      "name": "reinforced",
      "discriminator": [
        49,
        222,
        85,
        167,
        118,
        183,
        198,
        80
      ]
    },
    {
      "name": "subMinted",
      "discriminator": [
        239,
        133,
        220,
        74,
        28,
        39,
        202,
        166
      ]
    },
    {
      "name": "undocked",
      "discriminator": [
        221,
        83,
        228,
        219,
        110,
        209,
        123,
        211
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6001,
      "name": "boostAlreadyActive",
      "msg": "This harbor already has an active boost"
    },
    {
      "code": 6002,
      "name": "invalidBoostWindow",
      "msg": "Boost must end on a future hour within the boost ring"
    },
    {
      "code": 6003,
      "name": "boostRingCollision",
      "msg": "Boost ring slot is held by a different hour"
    },
    {
      "code": 6004,
      "name": "insufficientDepth",
      "msg": "Insufficient docked depth"
    },
    {
      "code": 6005,
      "name": "notAdmin",
      "msg": "Only the admin can do this"
    },
    {
      "code": 6006,
      "name": "notPendingAdmin",
      "msg": "Only the pending admin can accept"
    },
    {
      "code": 6007,
      "name": "notUpgradeAuthority",
      "msg": "Only the program upgrade authority can initialize"
    },
    {
      "code": 6008,
      "name": "invalidParams",
      "msg": "Configuration value out of bounds"
    },
    {
      "code": 6009,
      "name": "mintPaused",
      "msg": "Minting is paused"
    },
    {
      "code": 6010,
      "name": "upgradesPaused",
      "msg": "Upgrades are paused"
    },
    {
      "code": 6011,
      "name": "supplyCapReached",
      "msg": "Fleet is at its live supply cap"
    },
    {
      "code": 6012,
      "name": "notOwner",
      "msg": "You do not own this sub"
    },
    {
      "code": 6013,
      "name": "wrongSubState",
      "msg": "Sub is not in the required state"
    },
    {
      "code": 6014,
      "name": "harborFull",
      "msg": "Harbor has no free dock slot"
    },
    {
      "code": 6015,
      "name": "harborMaxed",
      "msg": "Harbor is at its maximum size"
    },
    {
      "code": 6016,
      "name": "maxLevel",
      "msg": "Sub is already at max reinforce level"
    },
    {
      "code": 6017,
      "name": "invalidMerge",
      "msg": "Subs must be different, of the same tier, and below the top tier"
    },
    {
      "code": 6018,
      "name": "invalidAsset",
      "msg": "Not a valid Metaplex Core asset"
    },
    {
      "code": 6019,
      "name": "vaultBelowRent",
      "msg": "Vault cannot pay without dropping below rent exemption"
    },
    {
      "code": 6020,
      "name": "rentDepositTooSmall",
      "msg": "Rent deposit does not cover reveal costs"
    },
    {
      "code": 6021,
      "name": "randomnessNotRevealed",
      "msg": "Randomness not revealed yet"
    },
    {
      "code": 6022,
      "name": "invalidExpeditionHours",
      "msg": "Expedition length must be 1 to 6 hours"
    },
    {
      "code": 6023,
      "name": "expeditionActive",
      "msg": "Harbor already has a sub on an expedition"
    },
    {
      "code": 6024,
      "name": "expeditionCooldown",
      "msg": "Next expedition is not available yet"
    },
    {
      "code": 6025,
      "name": "stillAway",
      "msg": "Sub has not returned yet"
    }
  ],
  "types": [
    {
      "name": "checkpoint",
      "docs": [
        "u128 split into halves so the layout is identical on the host and on SBF."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hour",
            "type": "i64"
          },
          {
            "name": "accLo",
            "type": "u64"
          },
          {
            "name": "accHi",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "checkpoints",
      "docs": [
        "Ring of accumulator snapshots at hour boundaries where boosts expired (DESIGN.md §5).",
        "17 KB, larger than a CPI-created account may be, so it is a keypair account created in the",
        "initialize transaction; its address is bound in `Config`."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "entries",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "checkpoint"
                  }
                },
                720
              ]
            }
          }
        ]
      }
    },
    {
      "name": "claimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "config",
      "docs": [
        "Global settings. Seeds: [\"config\"]. Admin is the Squads vault (DESIGN.md §9)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "pendingAdmin",
            "docs": [
              "Two-step admin transfer; Pubkey::default() when none."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "collection",
            "type": "pubkey"
          },
          {
            "name": "checkpoints",
            "docs": [
              "Address of the `Checkpoints` keypair account."
            ],
            "type": "pubkey"
          },
          {
            "name": "params",
            "type": {
              "defined": {
                "name": "params"
              }
            }
          },
          {
            "name": "pausedMint",
            "type": "bool"
          },
          {
            "name": "pausedUpgrades",
            "type": "bool"
          },
          {
            "name": "uriBase",
            "docs": [
              "Metadata URI prefix; the asset address is appended."
            ],
            "type": "string"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "poolBump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "authorityBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "configUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "docked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "depth",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "expeditionOutcome",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "nothing"
          },
          {
            "name": "barnacle",
            "fields": [
              {
                "name": "bit",
                "type": "u8"
              }
            ]
          },
          {
            "name": "boost",
            "fields": [
              {
                "name": "extra",
                "type": "u64"
              },
              {
                "name": "endHour",
                "type": "i64"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "expeditionReturned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "expeditionOutcome"
              }
            }
          },
          {
            "name": "fallback",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "expeditionStarted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "hours",
            "type": "u8"
          },
          {
            "name": "returnsAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "feeKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "mint"
          },
          {
            "name": "reinforce"
          },
          {
            "name": "merge"
          },
          {
            "name": "harborSlot"
          }
        ]
      }
    },
    {
      "name": "feePaid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "feeKind"
              }
            }
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "toPool",
            "type": "u64"
          },
          {
            "name": "toTreasury",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "harbor",
      "docs": [
        "One per player. Seeds: [\"harbor\", owner]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "slots",
            "type": "u8"
          },
          {
            "name": "docked",
            "docs": [
              "Subs in dock slots, including any away on an expedition."
            ],
            "type": "u8"
          },
          {
            "name": "rewards",
            "type": {
              "defined": {
                "name": "harborRewards"
              }
            }
          },
          {
            "name": "boostSub",
            "docs": [
              "Sub whose expedition produced the active boost; default when none."
            ],
            "type": "pubkey"
          },
          {
            "name": "expeditionSub",
            "docs": [
              "Sub currently on an expedition; default when none."
            ],
            "type": "pubkey"
          },
          {
            "name": "lastExpeditionReturn",
            "type": "i64"
          },
          {
            "name": "totalClaimed",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "harborExpanded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "slots",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "harborRewards",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "depth",
            "docs": [
              "Depth of docked subs that are not away. Excludes the boost."
            ],
            "type": "u64"
          },
          {
            "name": "boostExtra",
            "type": "u64"
          },
          {
            "name": "boostEndHour",
            "type": "i64"
          },
          {
            "name": "accSnapshot",
            "type": "u128"
          },
          {
            "name": "owed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "merged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "burned",
            "type": {
              "array": [
                "pubkey",
                2
              ]
            }
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "tier",
            "type": "u8"
          },
          {
            "name": "depth",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "mintCommitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "mintIndex",
            "type": "u64"
          },
          {
            "name": "randomness",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "params",
      "docs": [
        "Tunable economics (config/defaults.json). Every change is bounds-checked by `validate`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mintPrice",
            "type": "u64"
          },
          {
            "name": "poolBps",
            "type": "u16"
          },
          {
            "name": "window",
            "type": "i64"
          },
          {
            "name": "tierOddsBps",
            "type": {
              "array": [
                "u16",
                6
              ]
            }
          },
          {
            "name": "tierDepth",
            "type": {
              "array": [
                "u64",
                6
              ]
            }
          },
          {
            "name": "reinforceBpsPerLevel",
            "type": "u16"
          },
          {
            "name": "reinforceMaxLevel",
            "type": "u8"
          },
          {
            "name": "reinforceLamportsPerDepth",
            "type": "u64"
          },
          {
            "name": "reinforceGrowthBps",
            "type": "u16"
          },
          {
            "name": "mergeFee",
            "type": {
              "array": [
                "u64",
                5
              ]
            }
          },
          {
            "name": "harborStartSlots",
            "type": "u8"
          },
          {
            "name": "harborMaxSlots",
            "type": "u8"
          },
          {
            "name": "slotBaseLamports",
            "type": "u64"
          },
          {
            "name": "slotGrowthBps",
            "type": "u16"
          },
          {
            "name": "maxLiveSubs",
            "type": "u32"
          },
          {
            "name": "expeditionBoostBps",
            "type": "u16"
          },
          {
            "name": "expeditionBoostHoursPerHour",
            "type": "u8"
          },
          {
            "name": "expeditionBoostChanceBps",
            "type": "u16"
          },
          {
            "name": "expeditionBarnacleChanceBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "pauseSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "bool"
          },
          {
            "name": "upgrades",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "pendingMint",
      "docs": [
        "A paid mint awaiting its randomness. Seeds: [\"pending\", mint_index]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "mintIndex",
            "type": "u64"
          },
          {
            "name": "randomness",
            "docs": [
              "ORAO request account."
            ],
            "type": "pubkey"
          },
          {
            "name": "vrfSeed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "committedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pool",
      "docs": [
        "Reward accounting and fleet counters. Seeds: [\"pool\"]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rewards",
            "type": {
              "defined": {
                "name": "rewardState"
              }
            }
          },
          {
            "name": "mintedCount",
            "docs": [
              "Next mint index (also counts merge outputs). Asset PDAs are [\"asset\", index]."
            ],
            "type": "u64"
          },
          {
            "name": "liveSubs",
            "type": "u32"
          },
          {
            "name": "pendingMints",
            "type": "u32"
          },
          {
            "name": "activeHarbors",
            "docs": [
              "Harbors with depth > 0."
            ],
            "type": "u32"
          },
          {
            "name": "totalFees",
            "type": "u64"
          },
          {
            "name": "totalToTreasury",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "poolFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "funder",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "reinforced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "level",
            "type": "u8"
          },
          {
            "name": "depth",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "rewardState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "accPerDepth",
            "type": "u128"
          },
          {
            "name": "totalDepth",
            "docs": [
              "Sum of docked harbor depths plus boosts that have not reached their end boundary."
            ],
            "type": "u64"
          },
          {
            "name": "streamRemaining",
            "docs": [
              "Lamports deposited but not yet credited to the accumulator."
            ],
            "type": "u64"
          },
          {
            "name": "streamEnd",
            "type": "i64"
          },
          {
            "name": "lastUpdate",
            "type": "i64"
          },
          {
            "name": "totalDeposited",
            "type": "u64"
          },
          {
            "name": "totalCredited",
            "docs": [
              "Lamports reserved for harbors through the accumulator."
            ],
            "type": "u64"
          },
          {
            "name": "totalClaimed",
            "type": "u64"
          },
          {
            "name": "boostAmount",
            "type": {
              "array": [
                "u64",
                32
              ]
            }
          },
          {
            "name": "boostHour",
            "type": {
              "array": [
                "i64",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "sub",
      "docs": [
        "Stats for one sub. Seeds: [\"sub\", asset]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "mintIndex",
            "type": "u64"
          },
          {
            "name": "tier",
            "type": "u8"
          },
          {
            "name": "level",
            "type": "u8"
          },
          {
            "name": "baseDepth",
            "docs": [
              "Tier depth at mint time (later config changes do not affect existing subs)."
            ],
            "type": "u64"
          },
          {
            "name": "depth",
            "docs": [
              "base_depth with reinforcement; what the sub contributes while docked."
            ],
            "type": "u64"
          },
          {
            "name": "barnacles",
            "type": "u16"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "subState"
              }
            }
          },
          {
            "name": "harbor",
            "docs": [
              "Harbor while docked, away or returning; default when idle."
            ],
            "type": "pubkey"
          },
          {
            "name": "awayUntil",
            "type": "i64"
          },
          {
            "name": "awayHours",
            "type": "u8"
          },
          {
            "name": "randomness",
            "docs": [
              "ORAO request account for the return roll."
            ],
            "type": "pubkey"
          },
          {
            "name": "vrfSeed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "committedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "subMinted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "mintIndex",
            "type": "u64"
          },
          {
            "name": "tier",
            "type": "u8"
          },
          {
            "name": "depth",
            "type": "u64"
          },
          {
            "name": "fallback",
            "docs": [
              "True when randomness was never revealed and the fallback (lowest tier) applied."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "subState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "idle"
          },
          {
            "name": "docked"
          },
          {
            "name": "away"
          },
          {
            "name": "returning"
          }
        ]
      }
    },
    {
      "name": "undocked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "depth",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vault",
      "docs": [
        "Holds pool lamports only. Seeds: [\"vault\"]. Only `claim` moves lamports out."
      ],
      "type": {
        "kind": "struct",
        "fields": []
      }
    }
  ],
  "constants": [
    {
      "name": "assetSeed",
      "type": "bytes",
      "value": "[97, 115, 115, 101, 116]"
    },
    {
      "name": "authoritySeed",
      "type": "bytes",
      "value": "[97, 117, 116, 104, 111, 114, 105, 116, 121]"
    },
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "harborSeed",
      "type": "bytes",
      "value": "[104, 97, 114, 98, 111, 114]"
    },
    {
      "name": "pendingSeed",
      "type": "bytes",
      "value": "[112, 101, 110, 100, 105, 110, 103]"
    },
    {
      "name": "poolSeed",
      "type": "bytes",
      "value": "[112, 111, 111, 108]"
    },
    {
      "name": "subSeed",
      "type": "bytes",
      "value": "[115, 117, 98]"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
