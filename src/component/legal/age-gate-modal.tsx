import { useState } from "react";

import { Button } from "@/component/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/component/ui/dialog";
import { isAgeVerified, setAgeVerified } from "@/lib/legal-state";

import { LegalLinks } from "./legal-links";

type AgeGateModalProps = {
  onDenied: () => void;
};

export const AgeGateModal = ({ onDenied }: AgeGateModalProps) => {
  const [isOpen, setIsOpen] = useState(() => !isAgeVerified());

  const handleApprove = () => {
    setAgeVerified();
    setIsOpen(false);
  };

  const handleDecline = () => {
    setIsOpen(false);
    onDenied();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setIsOpen(true);
        }
      }}
    >
      <DialogContent className="max-w-md gap-6 p-8" showCloseButton={false}>
        <DialogHeader className="gap-4 text-center">
          <p className="font-narrative text-4xl font-bold tracking-widest text-primary/80">18+</p>
          <DialogTitle className="font-narrative text-xl tracking-wide">年齢確認</DialogTitle>
          <DialogDescription className="text-sm leading-7 text-muted-foreground">
            本アプリは 18 歳未満の方は利用できません。
            <br />
            18 歳以上ですか?
          </DialogDescription>
        </DialogHeader>
        <LegalLinks className="justify-center text-[0.8rem]" />
        <DialogFooter className="flex-col gap-2 bg-transparent p-0 pt-1 sm:flex-col">
          <Button type="button" size="lg" className="w-full" onClick={handleApprove}>
            はい、18歳以上です
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={handleDecline}
          >
            いいえ、退出します
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
