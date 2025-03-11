import { animated, easings, useSpring } from "@react-spring/web";
import React, {
  ImgHTMLAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckMarkIcon } from "../../../../assets/icon_components/CheckMarkIcon";
import { DocumentIcon } from "../../../../assets/icon_components/DocumentIcon";
import { MessageTail } from "../../../../assets/icon_components/MessageTail";
import { useModalWindowsContext } from "../../../../context/ModalWindowsContext";
import { LoadingImageSpinner } from "../../../../shared/components/LoadingSpinner";
import { ChatMessage as CM } from "../../../../types";
import {
  BASE_API_URL,
  formatBytes,
  getFilenameParts,
} from "../../../../untils";

type Props = {
  message: CM;
  chatType?: "p" | "g" | "c";
  myMessage?: boolean;
};

const imgExtensions = ["jpg", "jpeg", "jfif", "pjpeg", "pjp", "png", "webp"];

interface LazyImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
}

const LazyImage: React.FC<LazyImageProps> = ({ src, alt, ...props }) => {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = src;

    img.onload = () => setIsLoaded(true);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "1000px",
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      if (imgRef.current) {
        observer.unobserve(imgRef.current);
      }
    };
  }, []);

  return (
    <>
      <img
        ref={imgRef}
        src={isIntersecting ? src : ""}
        alt={alt}
        {...props}
        style={{
          opacity: isIntersecting && isLoaded ? 1 : 0,
        }}
      />
      {!isLoaded && <LoadingImageSpinner size={3} />}
    </>
  );
};

export const ChatMessage = React.memo(
  ({ message, chatType = "p", myMessage = false }: Props) => {
    const { setMediaViewerFileId } = useModalWindowsContext();
    const [isAvatarLoaded, setIsAvatarLoaded] = useState(false);
    const { setProfileViewerUserId } = useModalWindowsContext();

    const dateObj = new Date(message.timestamp);
    const time = `${dateObj.getHours()}:${
      dateObj.getMinutes() < 10 ? "0" : ""
    }${dateObj.getMinutes()}`;

    const springs = useSpring({
      from: {
        transform: "translateY(50%)",
        opacity: 0,
      },
      to: {
        transform: "translateY(0)",
        opacity: 1,
      },
      config: { duration: 100, easing: easings.easeOutSine },
    });

    let imgs: number[] = [];
    let docs: any[] = [];
    message.attachments?.forEach((a) => {
      if (imgExtensions.some((e) => a.filename.endsWith(e))) {
        imgs.push(a.id);
      } else docs.push(a);
    });

    const formatFileName = useCallback((filename: string) => {
      const parts = getFilenameParts(filename);
      return `${
        parts.name.length <= 25
          ? parts.name
          : parts.name.substring(0, 23) + "... "
      }.${parts.extension}`;
    }, []);

    const avatarUrl =
      chatType === "g"
        ? `${BASE_API_URL}/users/${message.sender?.id}/avatar`
        : undefined;

    useEffect(() => {
      if (!avatarUrl) return;

      const img = new Image();
      img.src = avatarUrl;

      img.onload = () => setIsAvatarLoaded(true);
    }, []);

    return (
      <animated.div
        className={`message ${myMessage ? "my-msg" : ""} ${
          chatType === "g" ? "group-msg" : ""
        } ${imgs.length > 0 ? "with-media" : ""} ${
          imgs.length === 0 && docs.length > 0 ? "less-rounded" : ""
        }`}
        style={springs}
      >
        {!myMessage && chatType === "g" && (
          <div className="msg-sender-name">
            {message.sender?.firstName} {message.sender?.lastName}
          </div>
        )}
        {imgs.length > 0 && (
          <div className="msg-img-container">
            {imgs.map((i) => (
              <div className="msg-img-item-wrapper" key={i}>
                <LazyImage
                  className="msg-img"
                  src={BASE_API_URL + "/chats/get-file?attId=" + i}
                  onClick={() => setMediaViewerFileId(i)}
                  alt="message-image"
                />
              </div>
            ))}
          </div>
        )}

        {docs.length > 0 && (
          <div className="msg-docs-container">
            {docs.map((a) => (
              <a
                key={a.id}
                className="doc-item"
                // target="_blank"
                href={`${BASE_API_URL}/chats/get-file?attId=${a.id}`}
                download={a.filename}
              >
                <div>
                  <div className="doc-img">
                    <DocumentIcon />
                  </div>
                  <div className="doc-info">
                    <div className="doc-name">{formatFileName(a.filename)}</div>
                    <div className="doc-size">{formatBytes(a.size)}</div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
        {/*same-author*/}
        {/* <div className="msg-img-container">
        <img className="msg-img" src="imgs/msg-test-img.png" />
        <img className="msg-img" src="imgs/msg-test-img.png" />
      </div> */}
        <div
          className={`msg-bottom ${
            message.text?.length < 30 ? "short-msg-text" : ""
          }`}
        >
          <div className="msg-text">{message.text}</div>
          <div className="msg-info">
            <span className="msg-time">{time}</span>
            {myMessage && (
              <div className="read-status">
                <CheckMarkIcon />
                {message.isSeen && <CheckMarkIcon />}
              </div>
            )}
          </div>
        </div>
        <MessageTail />

        {chatType === "g" && !myMessage && (
          <div
            className="user-message-avatar"
            style={
              isAvatarLoaded
                ? { backgroundImage: `url("${avatarUrl}")`, opacity: 1 }
                : { backgroundColor: "#7e7e7e", opacity: 0.3 }
            }
            onClick={() => setProfileViewerUserId(message.sender?.id)}
          ></div>
        )}
      </animated.div>
    );
  }
);
