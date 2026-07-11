use std::fmt;

const CHECKSUM_MAGIC: u32 = 0xB1B0_AFBA;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScaleError {
    UnsupportedCollection,
    InvalidFont,
    MissingHeadTable,
    InvalidScale,
}

impl fmt::Display for ScaleError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::UnsupportedCollection => "font collections are not supported",
            Self::InvalidFont => "invalid or truncated OpenType font",
            Self::MissingHeadTable => "font has no valid head table",
            Self::InvalidScale => "scale must be between 0.5 and 2.0",
        };
        formatter.write_str(message)
    }
}

impl std::error::Error for ScaleError {}

fn read_u16(bytes: &[u8], offset: usize) -> Option<u16> {
    Some(u16::from_be_bytes(
        bytes.get(offset..offset + 2)?.try_into().ok()?,
    ))
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_be_bytes(
        bytes.get(offset..offset + 4)?.try_into().ok()?,
    ))
}

fn write_u16(bytes: &mut [u8], offset: usize, value: u16) -> Result<(), ScaleError> {
    bytes
        .get_mut(offset..offset + 2)
        .ok_or(ScaleError::InvalidFont)?
        .copy_from_slice(&value.to_be_bytes());
    Ok(())
}

fn write_u32(bytes: &mut [u8], offset: usize, value: u32) -> Result<(), ScaleError> {
    bytes
        .get_mut(offset..offset + 4)
        .ok_or(ScaleError::InvalidFont)?
        .copy_from_slice(&value.to_be_bytes());
    Ok(())
}

fn checksum(bytes: &[u8]) -> u32 {
    bytes.chunks(4).fold(0u32, |sum, chunk| {
        let mut word = [0u8; 4];
        word[..chunk.len()].copy_from_slice(chunk);
        sum.wrapping_add(u32::from_be_bytes(word))
    })
}

/// Uniformly scale an individual OpenType face by changing its units-per-em.
/// All coordinates and metrics remain internally consistent because shaping
/// engines interpret every font-unit value against the new em square.
pub fn scale_font_uniform(bytes: &[u8], scale: f32) -> Result<Vec<u8>, ScaleError> {
    if !scale.is_finite() || !(0.5..=2.0).contains(&scale) {
        return Err(ScaleError::InvalidScale);
    }
    if bytes.get(..4) == Some(b"ttcf") {
        return Err(ScaleError::UnsupportedCollection);
    }
    if !matches!(bytes.get(..4), Some(b"\0\x01\0\0" | b"OTTO" | b"true")) {
        return Err(ScaleError::InvalidFont);
    }

    let table_count = read_u16(bytes, 4).ok_or(ScaleError::InvalidFont)? as usize;
    let directory_end = 12usize
        .checked_add(table_count.checked_mul(16).ok_or(ScaleError::InvalidFont)?)
        .ok_or(ScaleError::InvalidFont)?;
    if directory_end > bytes.len() {
        return Err(ScaleError::InvalidFont);
    }

    let mut head_record = None;
    for index in 0..table_count {
        let record = 12 + index * 16;
        if bytes.get(record..record + 4) == Some(b"head") {
            let offset = read_u32(bytes, record + 8).ok_or(ScaleError::InvalidFont)? as usize;
            let length = read_u32(bytes, record + 12).ok_or(ScaleError::InvalidFont)? as usize;
            if length < 20
                || offset
                    .checked_add(length)
                    .is_none_or(|end| end > bytes.len())
            {
                return Err(ScaleError::MissingHeadTable);
            }
            head_record = Some((record, offset, length));
            break;
        }
    }
    let (record, head_offset, head_length) = head_record.ok_or(ScaleError::MissingHeadTable)?;
    let original_upem = read_u16(bytes, head_offset + 18).ok_or(ScaleError::MissingHeadTable)?;
    let scaled_upem = ((original_upem as f32) / scale)
        .round()
        .clamp(16.0, 16_384.0) as u16;

    let mut output = bytes.to_vec();
    write_u16(&mut output, head_offset + 18, scaled_upem)?;
    write_u32(&mut output, head_offset + 8, 0)?;
    let head_checksum = checksum(&output[head_offset..head_offset + head_length]);
    write_u32(&mut output, record + 4, head_checksum)?;
    let adjustment = CHECKSUM_MAGIC.wrapping_sub(checksum(&output));
    write_u32(&mut output, head_offset + 8, adjustment)?;
    Ok(output)
}

#[cfg(feature = "wasm")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn scale_font_uniform_wasm(bytes: &[u8], scale: f32) -> Result<Vec<u8>, wasm_bindgen::JsValue> {
    scale_font_uniform(bytes, scale)
        .map_err(|error| wasm_bindgen::JsValue::from_str(&error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_font() -> Vec<u8> {
        let mut bytes = vec![0u8; 12 + 16 + 54];
        bytes[..4].copy_from_slice(b"\0\x01\0\0");
        bytes[4..6].copy_from_slice(&1u16.to_be_bytes());
        bytes[12..16].copy_from_slice(b"head");
        bytes[20..24].copy_from_slice(&28u32.to_be_bytes());
        bytes[24..28].copy_from_slice(&54u32.to_be_bytes());
        bytes[46..48].copy_from_slice(&1000u16.to_be_bytes());
        bytes
    }

    #[test]
    fn scales_the_whole_em_square() {
        let scaled = scale_font_uniform(&minimal_font(), 1.05).unwrap();
        assert_eq!(read_u16(&scaled, 46), Some(952));
        assert_ne!(read_u32(&scaled, 36), Some(0));
    }

    #[test]
    fn rejects_collections_and_unsafe_scales() {
        assert_eq!(
            scale_font_uniform(b"ttcf", 1.0),
            Err(ScaleError::UnsupportedCollection)
        );
        assert_eq!(
            scale_font_uniform(&minimal_font(), 0.1),
            Err(ScaleError::InvalidScale)
        );
    }

    #[test]
    fn scales_a_real_opentype_font() {
        let source = include_bytes!("../../../src-tauri/fonts/MiSansLatin-Regular.ttf");
        let scaled = scale_font_uniform(source, 1.05).unwrap();
        assert_eq!(scaled.len(), source.len());
        assert_ne!(scaled, source);
        let face = ttf_parser::Face::parse(&scaled, 0).unwrap();
        assert_eq!(face.units_per_em(), 952);
    }
}
