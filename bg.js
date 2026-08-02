const canvas = document.getElementById("nebulaCanvas");
const ctx = canvas.getContext("2d");

let width;
let height;

let time = 0;


let mouse = {
    x:0,
    y:0,
    tx:0,
    ty:0
};



function resize(){

    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;

}


window.addEventListener("resize", resize);

resize();



document.addEventListener("mousemove", e => {

    mouse.tx = (e.clientX / width - .5) * 40;
    mouse.ty = (e.clientY / height - .5) * 40;

});





const stars = [];


for(let i = 0; i < 60; i++){

    stars.push({

        x:Math.random() * width,
        y:Math.random() * height,

        r:Math.random() * 1.3,

        a:Math.random() * .6,

        s:Math.random() * .008 + .002

    });

}







const clouds = [

{
    x:.18,
    y:.30,
    r:340,
    color:"rgba(122,92,255,0.32)",
    speed:.28,
    motion:220,
    offset:1
},


{
    x:.68,
    y:.22,
    r:300,
    color:"rgba(83,148,255,0.26)",
    speed:.22,
    motion:190,
    offset:3
},


{
    x:.55,
    y:.72,
    r:420,
    color:"rgba(148,96,255,0.24)",
    speed:.18,
    motion:240,
    offset:5
},


{
    x:.83,
    y:.60,
    r:260,
    color:"rgba(255,255,255,0.08)",
    speed:.32,
    motion:170,
    offset:7
},


{
    x:.28,
    y:.62,
    r:360,
    color:"rgba(92,118,255,0.18)",
    speed:.24,
    motion:210,
    offset:9
}

];








function drawCloud(cloud, depth){



    const driftX =
        Math.sin(
            time * cloud.speed + cloud.offset
        )
        *
        cloud.motion;



    const driftY =
        Math.cos(
            time * cloud.speed * .7 + cloud.offset
        )
        *
        cloud.motion
        *
        .35;





    const px =
        cloud.x * width
        +
        driftX
        +
        mouse.x * depth;



    const py =
        cloud.y * height
        +
        driftY
        +
        mouse.y * depth;






    const gradient =
        ctx.createRadialGradient(

            px,
            py,
            0,

            px,
            py,
            cloud.r

        );




    gradient.addColorStop(
        0,
        cloud.color
    );


    gradient.addColorStop(
        .4,
        cloud.color.replace(
            /[\d\.]+\)$/,
            "0.14)"
        )
    );


    gradient.addColorStop(
        .7,
        cloud.color.replace(
            /[\d\.]+\)$/,
            "0.04)"
        )
    );


    gradient.addColorStop(
        1,
        "rgba(0,0,0,0)"
    );




    ctx.fillStyle = gradient;



    ctx.beginPath();

    ctx.arc(
        px,
        py,
        cloud.r,
        0,
        Math.PI * 2
    );

    ctx.fill();

}









function animate(){


    requestAnimationFrame(animate);


    time = performance.now() * .001;




    mouse.x +=
        (mouse.tx - mouse.x)
        *
        .05;


    mouse.y +=
        (mouse.ty - mouse.y)
        *
        .05;





    ctx.clearRect(
        0,
        0,
        width,
        height
    );







    const background =
        ctx.createLinearGradient(
            0,
            0,
            0,
            height
        );



    background.addColorStop(
        0,
        "#08101d"
    );


    background.addColorStop(
        .5,
        "#060814"
    );


    background.addColorStop(
        1,
        "#04050b"
    );



    ctx.fillStyle = background;


    ctx.fillRect(
        0,
        0,
        width,
        height
    );







    ctx.globalCompositeOperation = "screen";



    drawCloud(
        clouds[0],
        .18
    );


    drawCloud(
        clouds[1],
        .28
    );


    drawCloud(
        clouds[2],
        .12
    );


    drawCloud(
        clouds[3],
        .35
    );


    drawCloud(
        clouds[4],
        .22
    );



    ctx.globalCompositeOperation = "source-over";








    const cursorGlow =
        ctx.createRadialGradient(

            width/2 + mouse.x * 1.4,
            height/2 + mouse.y * 1.4,

            0,


            width/2 + mouse.x * 1.4,
            height/2 + mouse.y * 1.4,

            320

        );



    cursorGlow.addColorStop(
        0,
        "rgba(255,255,255,.04)"
    );


    cursorGlow.addColorStop(
        .5,
        "rgba(110,120,255,.03)"
    );


    cursorGlow.addColorStop(
        1,
        "rgba(0,0,0,0)"
    );




    ctx.fillStyle = cursorGlow;


    ctx.fillRect(
        0,
        0,
        width,
        height
    );









    for(const star of stars){


        star.a += star.s;



        if(
            star.a > .75 ||
            star.a < .15
        ){

            star.s *= -1;

        }





        ctx.beginPath();


        ctx.fillStyle =
        `rgba(255,255,255,${star.a})`;



        ctx.arc(

            star.x + mouse.x * .05,

            star.y + mouse.y * .05,

            star.r,

            0,

            Math.PI * 2

        );


        ctx.fill();


    }



}



animate();


