import React, { useCallback, useEffect, useRef } from "react";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";

export interface MagicCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    gradientSize?: number;
    gradientColor?: string;
    gradientOpacity?: number;
    key?: React.Key;
    onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function MagicCard({
    children,
    className,
    gradientSize = 200,
    gradientColor = "rgba(6, 182, 212, 0.15)", // cyan color like dashboard accents
    gradientOpacity = 0.8,
    style,
    ...props
}: MagicCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const mouseX = useMotionValue(-gradientSize);
    const mouseY = useMotionValue(-gradientSize);

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (cardRef.current) {
                const { left, top } = cardRef.current.getBoundingClientRect();
                const clientX = e.clientX;
                const clientY = e.clientY;
                mouseX.set(clientX - left);
                mouseY.set(clientY - top);
            }
        },
        [mouseX, mouseY],
    );

    const handleMouseOut = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!e.relatedTarget) {
                document.addEventListener("mousemove", mouseMoveEvent);
            } else {
                mouseX.set(-gradientSize);
                mouseY.set(-gradientSize);
            }
        },
        [handleMouseMove, mouseX, gradientSize, mouseY],
    );

    const handleMouseEnter = useCallback(() => {
        document.removeEventListener("mousemove", mouseMoveEvent);
        mouseX.set(-gradientSize);
        mouseY.set(-gradientSize);
    }, [mouseX, gradientSize, mouseY]);

    useEffect(() => {
        document.addEventListener("mousemove", mouseMoveEvent);
        return () => {
            document.removeEventListener("mousemove", mouseMoveEvent);
        };
    }, []);

    const mouseMoveEvent = (e: MouseEvent) => {
        const scale = window.visualViewport?.scale;
        if (scale === 1) {
            mouseX.set(e.clientX);
            mouseY.set(e.clientY);
        }
    };

    return (
        <div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseOut={handleMouseOut}
            onMouseEnter={handleMouseEnter}
            style={{
                position: "relative",
                display: "flex",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                borderRadius: "16px",
                backgroundColor: "#090c12", // match background
                border: "1px solid rgba(255, 255, 255, 0.05)",
                color: "#ffffff",
                ...style
            }}
            {...props}
        >
            <div style={{ position: "relative", zIndex: 10, width: "100%" }}>{children}</div>
            <motion.div
                style={{
                    pointerEvents: "none",
                    position: "absolute",
                    inset: "-1px",
                    borderRadius: "16px",
                    transition: "opacity 300ms",
                    opacity: gradientOpacity,
                    background: useMotionTemplate`
            radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px, ${gradientColor}, transparent 100%)
          `,
                }}
                animate={{ opacity: 1 }}
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
            />
            <motion.div
                style={{
                    pointerEvents: "none",
                    position: "absolute",
                    inset: "0px",
                    borderRadius: "16px",
                    mixBlendMode: "overlay",
                    backgroundColor: "rgba(10, 10, 10, 0.5)",
                    background: useMotionTemplate`
            radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px,
              rgba(255,255,255,0.1),
              transparent 100%
            )
          `,
                }}
            />
        </div>
    );
}
