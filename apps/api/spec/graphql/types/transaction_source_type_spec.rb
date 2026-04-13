# frozen_string_literal: true

require "rails_helper"

RSpec.describe Types::TransactionSourceType do
  describe "values" do
    subject(:values) { described_class.values }

    it "SHORTCUT が定義されている" do
      expect(values).to have_key("SHORTCUT")
    end

    it "MANUAL が定義されている" do
      expect(values).to have_key("MANUAL")
    end

    it "SHORTCUT の value が 'shortcut' である" do
      expect(values["SHORTCUT"].value).to eq("shortcut")
    end

    it "MANUAL の value が 'manual' である" do
      expect(values["MANUAL"].value).to eq("manual")
    end
  end
end
