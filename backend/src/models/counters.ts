const rules = {
    0: 1, //infantery < artillery
    1: 2, //artillery < cabaly
    2: 0, // cabaly < infantery
    3: null // asedio no tiene ni pro ni contras 
}

const power = {
    "t1": 1,
    "t2": 2,
    "t3": 4,
    "t4": 8,
    "t5": 16
}